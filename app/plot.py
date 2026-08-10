'''
Thesis figure from bench_results.json.

Runs on the host with CPython + matplotlib, not inside the container -- the
container image ships PyPy and no plotting stack. Point it at the JSON that
bench.py writes:

    python plot.py app/bench_results.json -o figures/ --width 15

bench.py records every timing in milliseconds; the axes are labelled to match.

One figure, bench_per_step: median milliseconds *per simulated instruction*,
log-log. The layers converge on the right (steady-state simulation cost,
identical everywhere) and fan out on the left, where the per-call overhead is
amortised over a single step -- which is what shows the overhead is a constant.

Print conventions this follows, because the output goes into the thesis in
../../latex (scrbook, a4paper, 12pt, DIV=14 -> \\textwidth 469.47pt = 16.5cm,
body set in Times by newtxtext/newtxmath, built with pdflatex):
  * The figure is rendered at its final printed size (--width, in cm, default
    16.5 = one full \\textwidth). Include it *without* a [width=...] key:
    scaling in LaTeX resizes the type along with the drawing, and the labels
    stop matching the body text.
        \\includegraphics{fig/bench_per_step}
    For a half-width figure re-render with --width 8.25, do not scale.
  * Times at 10 pt against the 12 pt body, with Times-metric math for the
    10^n exponents -- the same faces newtxtext and newtxmath set.
  * No title inside the figure. The description belongs in the LaTeX \\caption,
    where the numbering and the list of figures can reach it.
  * Vector PDF is the artefact to \\includegraphics. The PNG is a preview.
    Fonts are embedded as Type 42 so the PDF survives print production.
  * Every series carries colour *and* a marker *and* a dash pattern, so the
    figure still reads when the thesis is printed in greyscale.
'''
import argparse
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import LogLocator, LogFormatterSciNotation, NullFormatter

CM_PER_INCH = 2.54

# Categorical slots 1-4 of the reference palette, in fixed order, validated
# against a white page. Marker shape and dash pattern repeat the same identity
# on two further channels: colour-vision deficiency puts slot 4 (yellow) near
# slot 2 (orange), and a greyscale print collapses all four onto one axis.
SERIES_COLORS = ("#2a78d6", "#eb6834", "#1baf7a", "#eda100")
SERIES_MARKERS = ("o", "s", "^", "D")
SERIES_DASHES = ((), (5, 1.6), (1.4, 1.4), (6, 1.6, 1.4, 1.6))

INK_PRIMARY = "#0b0b0b"
INK_SECONDARY = "#3d3d3b"
GRIDLINE = "#d9d9d4"
AXIS = "#5c5c58"
SURFACE = "#ffffff"  # the page is white; an off-white panel reads as a defect

LAYER_CAPTIONS = {
    "L0": "L0  in-process, step loop",
    "L1": "L1  in-process, run_for_steps",
    "L2": "L2  local API",
    "L3": "L3  local API + view refresh",
}

# The thesis body is 12pt; figure labels sit a notch under it.
BASE_FONT_PT = 10


def use_thesis_style() -> None:
    '''
    Times, embedded fonts, hairline rules -- the house style of the thesis
    rather than of a screen dashboard.

    HHUD-thesis.cls loads newtxtext and newtxmath, so the document is set in
    Times with Times-metric math. The serif stack below names the Times clones
    in the order they are likely to be installed, and the math is rendered with
    STIX, whose metrics descend from the same Times design -- so an exponent in
    a tick label and one in a paragraph look like the same typeface.
    '''
    plt.rcParams.update({
        "font.family": "serif",
        "font.serif": [
            "TeX Gyre Termes", "Nimbus Roman", "Times New Roman", "Times",
            "Liberation Serif", "DejaVu Serif",
        ],
        "mathtext.fontset": "stix",
        "font.size": BASE_FONT_PT,
        "axes.labelsize": BASE_FONT_PT,
        "axes.titlesize": BASE_FONT_PT,
        "xtick.labelsize": BASE_FONT_PT - 1,
        "ytick.labelsize": BASE_FONT_PT - 1,
        "legend.fontsize": BASE_FONT_PT - 1,
        "axes.linewidth": 0.6,
        "xtick.major.width": 0.6,
        "ytick.major.width": 0.6,
        "xtick.minor.width": 0.4,
        "ytick.minor.width": 0.4,
        "lines.linewidth": 1.2,
        "lines.markersize": 3.6,
        # Type 42 keeps the glyphs embedded and selectable instead of shipping
        # the PDF as Type 3 outlines, which some print workflows reject.
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
        "savefig.facecolor": SURFACE,
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
    })


def load(results_path: str) -> tuple[list[str], dict]:
    '''Layer name -> [(batch_size, median), ...]. Non-layer keys are dicts.'''
    with open(results_path) as f:
        data = json.load(f)
    layers = [k for k in data if isinstance(data[k], list)]
    series = {
        layer: [(row["batch_size"], row["median"]) for row in data[layer]]
        for layer in layers
    }
    return layers, series


def _style_axes(ax, xlabel: str, ylabel: str) -> None:
    # Set before anything is plotted: switching an already-populated axis to a
    # log scale leaves the linear autoscale in place and drops the small points.
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.margins(x=0.08, y=0.14)
    ax.set_xlabel(xlabel, color=INK_PRIMARY)
    ax.set_ylabel(ylabel, color=INK_PRIMARY)

    ax.grid(True, which="major", color=GRIDLINE, linewidth=0.5, zorder=0)
    ax.grid(True, which="minor", color=GRIDLINE, linewidth=0.3, alpha=0.7, zorder=0)
    ax.set_axisbelow(True)

    # Decades get a 10^n label; the minor decades stay as gridlines and ticks.
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_formatter(LogFormatterSciNotation())
        axis.set_minor_locator(LogLocator(base=10.0, subs=tuple(range(2, 10))))
        axis.set_minor_formatter(NullFormatter())

    # A closed frame with inward ticks on all four sides -- the convention in
    # printed scientific work, where the axes are a measuring instrument rather
    # than a decorative baseline.
    for spine in ax.spines.values():
        spine.set_visible(True)
        spine.set_color(AXIS)
    ax.tick_params(
        which="both", direction="in", top=True, right=True,
        color=AXIS, labelcolor=INK_SECONDARY,
    )
    ax.tick_params(which="major", length=3.2)
    ax.tick_params(which="minor", length=1.8)


def _plot(ax, layers: list[str], series: dict, transform) -> None:
    anchors = []
    for i, layer in enumerate(layers):
        # A median of 0 has no place on a log axis. bench.py rounds to
        # ROUNDING decimals, so a fast enough batch can land on exactly 0.0 --
        # those points are dropped and reported rather than silently plotted at
        # the axis floor.
        points = [(b, m) for b, m in series[layer] if transform(b, m) > 0]
        dropped = len(series[layer]) - len(points)
        if dropped:
            print(f"  {layer}: skipped {dropped} point(s) with a non-positive value")
        if not points:
            continue
        xs = [b for b, _ in points]
        ys = [transform(b, m) for b, m in points]
        line, = ax.plot(
            xs, ys,
            color=SERIES_COLORS[i % len(SERIES_COLORS)],
            marker=SERIES_MARKERS[i % len(SERIES_MARKERS)],
            markerfacecolor="none",  # open marks keep the line visible through them
            markeredgewidth=0.9,
            label=LAYER_CAPTIONS.get(layer, layer),
            zorder=3,
        )
        line.set_dashes(SERIES_DASHES[i % len(SERIES_DASHES)])
        anchors.append((layer, xs[0], ys[0]))
    _direct_labels(ax, anchors)


def _direct_labels(ax, anchors: list[tuple[str, float, float]]) -> None:
    '''
    Label each line at its leftmost point, where the layers are furthest apart.

    Two of the four palette slots sit under 3:1 against the page, so these
    labels are required relief rather than decoration; they wear ink, not the
    series colour -- the line end beside them carries the identity. Layers whose
    curves genuinely coincide (L0 and L1) would print their labels on top of
    each other, so anything closer than one line height is nudged apart in
    display space.
    '''
    if not anchors:
        return
    fig = ax.get_figure()
    fig.canvas.draw()  # label placement needs a resolved transform

    placed = sorted(
        ((ax.transData.transform((x, y))[1], layer) for layer, x, y in anchors),
        key=lambda pair: pair[0],
    )
    min_gap = (BASE_FONT_PT + 2) * fig.dpi / 72.0  # one line of type, in px
    for i in range(1, len(placed)):
        if placed[i][0] - placed[i - 1][0] < min_gap:
            placed[i] = (placed[i - 1][0] + min_gap, placed[i][1])

    x_display = {layer: ax.transData.transform((x, y))[0] for layer, x, y in anchors}
    inv = ax.transData.inverted()
    for y_display, layer in placed:
        x_data, y_data = inv.transform((x_display[layer], y_display))
        ax.annotate(
            layer,
            xy=(x_data, y_data),
            xytext=(-5, 0),
            textcoords="offset points",
            color=INK_PRIMARY,
            fontsize=BASE_FONT_PT - 1,
            ha="right",
            va="center",
            zorder=4,
            annotation_clip=False,
        )


def figure_per_step(layers: list[str], series: dict, out_base: str,
                    width_cm: float, dpi: int) -> list[str]:
    width_in = width_cm / CM_PER_INCH
    fig, ax = plt.subplots(figsize=(width_in, width_in * 0.62))
    _style_axes(
        ax,
        "batch size (instructions)",
        "median time per instruction (ms)",
    )
    _plot(ax, layers, series, lambda batch, median: median / batch)

    # Upper right is the empty corner: every layer descends left to right.
    legend = ax.legend(
        loc="upper right",
        frameon=True,
        framealpha=1.0,
        borderpad=0.5,
        labelspacing=0.4,
        handlelength=2.6,
        labelcolor=INK_PRIMARY,
    )
    legend.get_frame().set_linewidth(0.5)
    legend.get_frame().set_edgecolor(GRIDLINE)
    legend.set_zorder(5)

    fig.tight_layout(pad=0.3)
    written = []
    for ext in ("pdf", "png"):
        path = f"{out_base}.{ext}"
        fig.savefig(path, dpi=dpi)
        written.append(path)
    plt.close(fig)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Render the benchmark figure.")
    parser.add_argument("results", nargs="?", default="bench_results.json",
                        help="path to bench_results.json")
    parser.add_argument("-o", "--outdir", default=".", help="directory for the figure")
    parser.add_argument("--width", type=float, default=16.5,
                        help="printed width in cm; render at final size, do not "
                             "rescale in LaTeX (default: 16.5, the thesis "
                             "\\textwidth)")
    parser.add_argument("--dpi", type=int, default=600,
                        help="raster DPI for the PNG preview (default: 600)")
    args = parser.parse_args()

    layers, series = load(args.results)
    if not layers:
        raise SystemExit(f"no layer results in {args.results}")
    os.makedirs(args.outdir, exist_ok=True)

    use_thesis_style()
    written = figure_per_step(
        layers, series, os.path.join(args.outdir, "bench_per_step"),
        args.width, args.dpi,
    )
    for path in written:
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
