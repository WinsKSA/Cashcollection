import pymupdf, io

MARK = ('<path d="M366.13 126.72L376.63 116.40L387.14 126.72L377.01 137.79ZM376.07 95.40L343.81 126.91L366.69 149.04'
        'L357.31 158.04L367.82 167.80L408.33 126.91Z"/>'
        '<path d="M328.58 111.22L304.94 135.51L278.71 111.22L267.06 123.64L303.65 158.50L339.58 123.64Z"/>'
        '<path d="M314.21 101.19L304.94 110.46L295.67 101.19L304.94 91.92Z"/>'
        '<path d="M247.99 110.76L262.57 124.95L231.64 158.83L216.98 141.64L198.68 158.83L167.67 126.70L184.11 110.76'
        'L199.05 127.82L215.12 110.76L231.93 127.07Z"/>')

# mark bbox: x 167.67..408.33 (w 240.66), y 91.92..167.80 (h 75.88); centre (288.0, 129.86)
def svg(size, radius_ratio, bg, fg, pad_ratio):
    target_w = size * pad_ratio
    scale = target_w / 240.66
    r = size * radius_ratio
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" rx="{r}" fill="{bg}"/>'
            f'<g transform="translate({size/2},{size/2}) scale({scale}) translate(-288,-129.86)" fill="{fg}">{MARK}</g>'
            f'</svg>')

specs = [
    ("icon-192.png", 192, 0.22, 0.62),
    ("icon-512.png", 512, 0.22, 0.62),
    ("apple-touch-icon.png", 180, 0.0, 0.62),   # iOS masks corners itself
    ("favicon-64.png", 64, 0.20, 0.68),
]
for name, size, rr, pad in specs:
    s = svg(size, rr, "#06070B", "#C9A04D", pad)
    doc = pymupdf.open(stream=s.encode("utf-8"), filetype="svg")
    page = doc[0]
    zoom = size / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    pix.save(name)
    print(name, pix.width, "x", pix.height)
