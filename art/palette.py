"""The asset palette: the colours of docs/ART_DIRECTION.md that models use, plus derived trims.

The doc writes colours as sRGB hex. Blender colour attributes and glTF COLOR_0 hold
linear values, so scripts read every colour through `color()`, which converts.
"""

SRGB = {
    "sky_top": "#5b8fd9",
    "sky_horizon": "#ffc89a",
    "sun": "#ffe3b0",
    "shadow": "#6a5acd",
    "sand": "#e8a565",
    "mesa": "#c8664a",
    "asphalt": "#4a4458",
    "lane_paint": "#fff4d6",
    "roadster": "#d9d6d0",
    "roadster_lower": "#1f1d24",
    "roadster_red": "#e8322e",
    "police_blue": "#2f6bff",
    "police_red": "#ff3048",
    "thruster": "#eaf6ff",
}


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _hex_to_linear(value):
    value = value.lstrip("#")
    return tuple(_srgb_to_linear(int(value[i : i + 2], 16) / 255) for i in (0, 2, 4))


def _mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def _shade(c, k):
    return tuple(x * k for x in c)


_LINEAR = {name: _hex_to_linear(value) for name, value in SRGB.items()}

# Trim colours derive from palette entries, so a palette change carries through.
_LINEAR.update(
    trim=_shade(_LINEAR["asphalt"], 0.45),
    tyre=_shade(_LINEAR["asphalt"], 0.3),
    rim=_shade(_LINEAR["asphalt"], 1.6),
    glass=_shade(_mix(_LINEAR["asphalt"], _LINEAR["shadow"], 0.3), 0.4),
)


def hex_color(value):
    """Linear RGBA for a one-off sRGB hex colour that a single asset uses."""
    return (*_hex_to_linear(value), 1.0)


def color(name):
    """Linear RGBA for a palette or trim colour."""
    return (*_LINEAR[name], 1.0)
