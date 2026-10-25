// Analyse one bank photo with macOS Vision (macOS 14+).
//
//   analyze-photo <image> <cutout-out.png> [--no-cutout]
//
// Prints ONE line of JSON:
//   {"width":W,"height":H,
//    "subject":{"x0":..,"y0":..,"x1":..,"y1":..} | null,   // lifted foreground, normalised, top-left origin
//    "faces":{"y0":..,"y1":..} | null,                     // vertical band of the main faces
//    "cutout":{"width":w,"height":h} | null}               // written to <cutout-out.png> when usable
//
// The cut-out is the Photos "lift subject" mask (keeps what people hold:
// bikes, drinks, mics), cropped to the subject. It is only written when the
// photo has people (≥1 face) and the subject is big enough to hold up on a
// poster; otherwise "cutout" is null and nothing is written.
import AppKit
import CoreImage
import Foundation
import Vision

func emit(_ obj: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: analyze-photo <image> <cutout.png>\n".data(using: .utf8)!)
  exit(2)
}
let src = URL(fileURLWithPath: args[1])
let dst = URL(fileURLWithPath: args[2])
let allowCutout = !args.contains("--no-cutout")
guard let ci = CIImage(contentsOf: src, options: [.applyOrientationProperty: true]) else {
  emit(["error": "load"])
  exit(1)
}
let W = Int(ci.extent.width), H = Int(ci.extent.height)
let handler = VNImageRequestHandler(ciImage: ci, options: [:])

// ── Faces: band of the meaningful faces (ignore tiny background faces) ──
let faceReq = VNDetectFaceRectanglesRequest()
var faces: [String: Double]? = nil
if (try? handler.perform([faceReq])) != nil, let res = faceReq.results, !res.isEmpty {
  let biggest = res.map { $0.boundingBox.height }.max() ?? 0
  let main = res.filter { $0.boundingBox.height >= max(0.025, biggest * 0.45) }
  if !main.isEmpty {
    // Vision boxes are normalised with a bottom-left origin.
    let tops = main.map { 1 - ($0.boundingBox.origin.y + $0.boundingBox.height) }
    let bottoms = main.map { 1 - $0.boundingBox.origin.y }
    // Horizontal focus follows only the dominant faces (≥70% of the biggest),
    // so a background face at the edge doesn't drag the framing off the subject.
    let lead = main.filter { $0.boundingBox.height >= biggest * 0.7 }
    let lefts = lead.map { $0.boundingBox.origin.x }
    let rights = lead.map { $0.boundingBox.origin.x + $0.boundingBox.width }
    faces = [
      "y0": max(0, tops.min()!), "y1": min(1, bottoms.max()!),
      "x0": max(0, lefts.min()!), "x1": min(1, rights.max()!),
    ]
  }
}

// ── Words in the picture: flyers, collages and branded overlays carry text ──
let textReq = VNRecognizeTextRequest()
textReq.recognitionLevel = .fast
var textBoxes: [CGRect] = []
if (try? handler.perform([textReq])) != nil, let res = textReq.results {
  for o in res where (o.topCandidates(1).first?.confidence ?? 0) >= 0.5 {
    let s = o.topCandidates(1).first?.string ?? ""
    if s.filter({ $0.isLetter }).count >= 3 { textBoxes.append(o.boundingBox) }
  }
}

// ── Subject lift: mask → bounding box (+ cut-out when usable) ──
let liftReq = VNGenerateForegroundInstanceMaskRequest()
var subject: [String: Double]? = nil
var cutout: [String: Int]? = nil
var sliced: String? = nil
if (try? handler.perform([liftReq])) != nil, let obs = liftReq.results?.first, !obs.allInstances.isEmpty {
  if let mask = try? obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler) {
    CVPixelBufferLockBaseAddress(mask, .readOnly)
    let mw = CVPixelBufferGetWidth(mask), mh = CVPixelBufferGetHeight(mask)
    let rowBytes = CVPixelBufferGetBytesPerRow(mask)
    let base = CVPixelBufferGetBaseAddress(mask)!
    let fmt = CVPixelBufferGetPixelFormatType(mask)
    var minX = mw, minY = mh, maxX = -1, maxY = -1, on = 0
    var colCount = [Int](repeating: 0, count: mw)
    var rowCount = [Int](repeating: 0, count: mh)
    for y in stride(from: 0, to: mh, by: 2) {
      let row = base.advanced(by: y * rowBytes)
      for x in stride(from: 0, to: mw, by: 2) {
        var v: Float = 0
        if fmt == kCVPixelFormatType_OneComponent32Float {
          v = row.assumingMemoryBound(to: Float.self)[x]
        } else {
          v = Float(row.assumingMemoryBound(to: UInt8.self)[x]) / 255
        }
        if v > 0.5 {
          on += 1
          colCount[x] += 1
          rowCount[y] += 1
          if x < minX { minX = x }; if x > maxX { maxX = x }
          if y < minY { minY = y }; if y > maxY { maxY = y }
        }
      }
    }
    CVPixelBufferUnlockBaseAddress(mask, .readOnly)
    if maxX >= minX && maxY >= minY {
      // CVPixelBuffer rows run top-down, so y is already top-left origin.
      subject = [
        "x0": Double(minX) / Double(mw), "y0": Double(minY) / Double(mh),
        "x1": Double(maxX + 1) / Double(mw), "y1": Double(maxY + 1) / Double(mh),
      ]
      let boxW = Double(maxX - minX + 1), boxH = Double(maxY - minY + 1)
      let fill = Double(on * 4) / max(1, boxW * boxH)
      let tallEnough = boxH / Double(mh) >= 0.42
      let bigEnough = min(boxW / Double(mw) * Double(W), boxH / Double(mh) * Double(H)) >= 360
      // Scattered subjects (people far apart, flyer fragments) leave a wide
      // empty vertical gap inside the box: a cut-out of those reads as debris.
      var longestGap = 0, run = 0
      let minOn = max(1, Int(boxH / 2 * 0.01))
      for x in stride(from: minX, through: maxX, by: 2) {
        if colCount[x] < minOn { run += 2; longestGap = max(longestGap, run) } else { run = 0 }
      }
      let compact = Double(longestGap) <= boxW * 0.08
      // Same across rows: a collage stacks fragments with empty rows between.
      var longestRowGap = 0, rrun = 0
      let minOnRow = max(1, Int(boxW / 2 * 0.01))
      for y in stride(from: minY, through: maxY, by: 2) {
        if rowCount[y] < minOnRow { rrun += 2; longestRowGap = max(longestRowGap, rrun) } else { rrun = 0 }
      }
      let compactRows = Double(longestRowGap) <= boxH * 0.06
      // People sliced by the photo's left/right/top edge leave a hard straight
      // edge on the cut-out. Only the bottom edge may cut them (torsos).
      let leftTouch = colCount[0] + (mw > 1 ? colCount[1] : 0)
      let rightTouch = colCount[mw - 1] + (mw > 1 ? colCount[mw - 2] : 0)
      let topTouch = rowCount[0] + (mh > 1 ? rowCount[1] : 0)
      let slicedLeft = Double(leftTouch) > Double(mh / 2) * 0.12
      let slicedRight = Double(rightTouch) > Double(mh / 2) * 0.12
      let slicedTop = Double(topTouch) > Double(mw / 2) * 0.10
      // One sliced side is fine (the layout puts that side flush with the
      // poster edge); both sides or the top (cut heads) is not.
      // Any readable word inside the subject means a graphic, not a photo.
      let sx0 = Double(minX) / Double(mw), sx1 = Double(maxX + 1) / Double(mw)
      let sy0 = 1 - Double(maxY + 1) / Double(mh), sy1 = 1 - Double(minY) / Double(mh) // Vision space (bottom-left)
      let hasWords = textBoxes.contains { b in
        b.midX >= sx0 && b.midX <= sx1 && b.midY >= sy0 && b.midY <= sy1
      }
      let clean = compactRows && !slicedTop && !(slicedLeft && slicedRight) && !hasWords
      if slicedLeft { sliced = "left" } else if slicedRight { sliced = "right" }
      if allowCutout && faces != nil && tallEnough && bigEnough && fill >= 0.33 && compact && clean,
        let buf = try? obs.generateMaskedImage(ofInstances: obs.allInstances, from: handler, croppedToInstancesExtent: true)
      {
        let out = CIImage(cvPixelBuffer: buf)
        let ctx = CIContext()
        if let cg = ctx.createCGImage(out, from: out.extent),
          let png = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]),
          (try? png.write(to: dst)) != nil
        {
          cutout = ["width": cg.width, "height": cg.height]
        }
      }
    }
  }
}

// Printed words big enough to read as part of the picture (flyer text,
// captions, collage titles): small signage in a bar photo doesn't count.
let textArea = textBoxes.reduce(0.0) { $0 + Double($1.width * $1.height) }
// Designed flyers cover >= ~4% of the frame in words; a neon sign or a
// T-shirt in a real crowd shot stays under that.
let hasText = textArea >= 0.035

emit([
  "width": W, "height": H,
  "hasText": hasText,
  "textArea": (textArea * 1000).rounded() / 1000,
  "maxTextH": ((textBoxes.map { Double($0.height) }.max() ?? 0) * 1000).rounded() / 1000,
  "subject": subject as Any? ?? NSNull(),
  "faces": faces as Any? ?? NSNull(),
  "cutout": cutout as Any? ?? NSNull(),
  "sliced": (cutout != nil ? sliced : nil) as Any? ?? NSNull(),
])
