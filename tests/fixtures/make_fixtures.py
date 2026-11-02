"""Writes made-up lab reports for the browser checks: python tests/fixtures/make_fixtures.py
Every name and number here is invented. The PDFs are git-ignored like all PDFs in this repo."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent

HEADER = [
    (50, 780, 'KLINIK CONTOH MAKMAL'),
    (50, 760, 'Patient Name: TAN AH KOW'),
    (330, 760, 'Report Date: 15/03/2026'),
    (50, 745, 'IC No: 880101-14-5678'),
    (330, 745, 'Lab No: 26-0099'),
    (50, 730, 'Tel: 012-345 6789'),
    (50, 715, 'No. 12, Jalan Mawar 3, Taman Bunga Raya'),
    (50, 700, '47301 Petaling Jaya, Selangor'),
    (50, 685, 'Fasting: Yes'),
    (50, 660, 'TEST'), (230, 660, 'RESULT'), (310, 660, 'UNIT'), (400, 660, 'REFERENCE'),
]
RESULTS = [
    ('Total Cholesterol', '5.8 H', 'mmol/L', '< 5.2'),
    ('LDL-Cholesterol', '3.9 H', 'mmol/L', '< 3.0'),
    ('HDL Cholesterol', '1.3', 'mmol/L', '1.0 - 2.0'),
    ('Triglycerides', '130', 'mg/dL', '< 150'),
    ('Glucose (Fasting)', '5.2', 'mmol/L', '3.9 - 6.0'),
    ('HbA1c', '5.6', '%', '4.0 - 6.0'),
    ('ALT (SGPT)', '32', 'U/L', '< 41'),
    ('Creatinine', '88', 'umol/L', '62 - 106'),
    ('Urine Protein', 'Trace', '', 'Negative'),
    ('Vitamin Z', '12', 'ng/mL', '10 - 20'),
]


def esc(s):
    return s.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')


def text_pdf(path):
    items = list(HEADER)
    y = 640
    for name, value, unit, ref in RESULTS:
        items += [(50, y, name), (230, y, value), (310, y, unit), (400, y, ref)]
        y -= 18
    stream = 'BT /F1 11 Tf\n' + ''.join(f'1 0 0 1 {x} {yy} Tm ({esc(t)}) Tj\n' for x, yy, t in items if t) + 'ET'
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        f'<< /Length {len(stream)} >>\nstream\n{stream}\nendstream'.encode('latin-1'),
    ]
    out = b'%PDF-1.4\n'
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f'{i} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode()
    for off in offsets:
        out += f'{off:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    path.write_bytes(out)


def scanned_pdf(path):
    img = Image.new('RGB', (1240, 1754), 'white')
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('arial.ttf', 30)
    except OSError:
        font = ImageFont.load_default(30)
    lines = ['KLINIK CONTOH MAKMAL', 'Patient Name: TAN AH KOW', 'IC No: 880101-14-5678', 'Report Date: 20/09/2026', '',
             'LDL-Cholesterol     3.1     mmol/L     < 3.0', 'HDL Cholesterol     1.4     mmol/L     1.0 - 2.0',
             'Creatinine     90     umol/L     62 - 106']
    y = 120
    for line in lines:
        draw.text((100, y), line, fill='black', font=font)
        y += 60
    img.save(path, 'PDF', resolution=150)


text_pdf(OUT / 'sample-text.pdf')
scanned_pdf(OUT / 'sample-scanned.pdf')
print('written to', OUT)
