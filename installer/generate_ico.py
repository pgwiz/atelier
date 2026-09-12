"""
Generates a multi-resolution Windows .ico icon for Atelier Studio.
Produces sizes: 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256.
Design: Dark geometric rounded shield/canvas with Atelier 'A' and creative spark.
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_atelier_icon():
    os.makedirs('installer', exist_ok=True)
    size = 512
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Outer rounded surface / canvas plate (solid #0f172a with 1px border #38bdf8)
    pad = 28
    radius = 64
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        fill=(15, 23, 42, 255),      # #0f172a
        outline=(56, 189, 248, 255), # #38bdf8
        width=12
    )

    # Inner subtle panel (#1e293b)
    inner_pad = 60
    draw.rounded_rectangle(
        [inner_pad, inner_pad, size - inner_pad, size - inner_pad],
        radius=40,
        fill=(30, 41, 59, 255)       # #1e293b
    )

    # Geometric Stylized Atelier 'A' in vibrant cyan/electric blue (#38bdf8 & #60a5fa)
    # Left leg
    left_leg = [
        (256, 110),
        (290, 110),
        (165, 395),
        (110, 395)
    ]
    draw.polygon(left_leg, fill=(56, 189, 248, 255))

    # Right leg
    right_leg = [
        (222, 110),
        (256, 110),
        (402, 395),
        (347, 395)
    ]
    draw.polygon(right_leg, fill=(96, 165, 250, 255))

    # Center crossbar
    crossbar = [
        (165, 285),
        (347, 285),
        (332, 325),
        (180, 325)
    ]
    draw.polygon(crossbar, fill=(248, 250, 252, 255))

    # Accent diamond/sparkle above apex
    spark_center = (256, 110)
    spark_rad = 18
    sparkle = [
        (spark_center[0], spark_center[1] - spark_rad),
        (spark_center[0] + spark_rad, spark_center[1]),
        (spark_center[0], spark_center[1] + spark_rad),
        (spark_center[0] - spark_rad, spark_center[1])
    ]
    draw.polygon(sparkle, fill=(255, 255, 255, 255))

    # Save multi-size .ico
    icon_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    out_path = os.path.join('installer', 'atelier.ico')
    img.save(out_path, format='ICO', sizes=icon_sizes)
    print(f"Generated multi-size icon: {out_path}")

    # Also save a 256x256 PNG for installer wizard / headers
    png_path = os.path.join('installer', 'atelier-256.png')
    img.resize((256, 256), Image.Resampling.LANCZOS).save(png_path, format='PNG')
    print(f"Generated preview PNG: {png_path}")

if __name__ == '__main__':
    create_atelier_icon()
