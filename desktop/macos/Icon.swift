import AppKit

let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
func render(_ size: Int, _ filename: String) throws {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let transform = NSAffineTransform()
    transform.scale(by: CGFloat(size) / 1024)
    transform.concat()
    let green = NSColor(calibratedRed: 0.16, green: 0.30, blue: 0.24, alpha: 1)
    let thread = NSColor(calibratedRed: 0.83, green: 0.91, blue: 0.73, alpha: 1)
    green.setFill()
    NSBezierPath(roundedRect: NSRect(x: 44, y: 44, width: 936, height: 936), xRadius: 208, yRadius: 208).fill()
    // Use the favicon's 40-unit coordinates, flipped to AppKit's bottom origin.
    func point(_ x: CGFloat, _ y: CGFloat) -> NSPoint { NSPoint(x: 44 + x * 23.4, y: 980 - y * 23.4) }
    thread.setStroke(); thread.setFill()
    let hoop = NSBezierPath(ovalIn: NSRect(x: point(10, 25).x, y: point(10, 25).y, width: 468, height: 468))
    hoop.lineWidth = 35.1; hoop.stroke()
    let web = NSBezierPath()
    func anchor(_ i: Int, radius: CGFloat, offset: CGFloat = 0) -> NSPoint {
        let angle = (-90 + CGFloat(i) * 45 + offset) * .pi / 180
        return point(20 + radius * cos(angle), 15 + radius * sin(angle))
    }
    for i in 0..<8 {
        web.move(to: anchor(i, radius: 10))
        web.line(to: anchor(i, radius: 5.3, offset: 22.5))
        web.line(to: anchor((i + 1) % 8, radius: 10))
        web.move(to: anchor(i, radius: 5.3, offset: 22.5))
        web.line(to: anchor((i + 1) % 8, radius: 5.3, offset: 22.5))
    }
    web.lineWidth = 18.72; web.lineJoinStyle = .round; web.stroke()
    let center = point(20, 15)
    NSBezierPath(ovalIn: NSRect(x: center.x - 28.08, y: center.y - 28.08, width: 56.16, height: 56.16)).fill()
    for (x, top, end, feather) in [(14.0, 23.2, 28.0, 27.0), (20.0, 25.0, 31.0, 30.0), (26.0, 23.2, 28.0, 27.0)] {
        let line = NSBezierPath(); line.move(to: point(x, top)); line.line(to: point(x, end))
        line.lineWidth = 28.08; line.lineCapStyle = .round; line.stroke()
        let leaf = NSBezierPath(); leaf.move(to: point(x, feather))
        leaf.curve(to: point(x, feather + 6), controlPoint1: point(x - 3.5, feather + 1.5), controlPoint2: point(x - 2, feather + 4.5))
        leaf.curve(to: point(x, feather), controlPoint1: point(x + 2, feather + 4.5), controlPoint2: point(x + 3.5, feather + 1.5))
        leaf.close(); leaf.fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(filename))
}
for size in [16, 32, 128, 256, 512] {
    try render(size, "icon_\(size)x\(size).png")
    try render(size * 2, "icon_\(size)x\(size)@2x.png")
}
