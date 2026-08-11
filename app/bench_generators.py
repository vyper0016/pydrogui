'''
Report generation for benchmark results.

bench.py measures and writes bench_results.json; this module turns that JSON
into a readable artefact. Kept separate so the measuring code stays free of
presentation concerns.

Every timing in the JSON is in milliseconds, so variances are in ms².
'''
import json

import paths


def generate_report(results_path: str = "bench_results.json") -> str:
    '''generate an HTML report from the benchmark results JSON file - AI generated function code'''
    with open(results_path) as f:
        data = json.load(f)

    # layer entries are lists of batch results; "env" and "differences" are not
    layers = [k for k in data if isinstance(data[k], list)]
    batch_sizes = [row["batch_size"] for row in data[layers[0]]]

    def fmt(v) -> str:
        return f"{v:.6g}"

    def table(headers: list[str], rows: list[list[str]]) -> str:
        head = "".join(f"<th>{h}</th>" for h in headers)
        body = "".join(
            "<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>"
            for row in rows
        )
        return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"

    # --- combined per-layer table (layer name spans its batch rows) ---
    headers = ["layer", "batch_size", "median (ms)", "mean (ms)", "variance (ms²)"]
    head = "".join(f"<th>{h}</th>" for h in headers)
    body = ""
    for layer in layers:
        rows = data[layer]
        for i, r in enumerate(rows):
            cells = ""
            if i == 0:
                cells += f"<td class='layer'>{layer}</td>" if len(rows) == 1 else \
                    f"<td class='layer' rowspan='{len(rows)}'>{layer}</td>"
            cells += (
                f"<td>{r['batch_size']}</td><td>{fmt(r['median'])}</td>"
                f"<td>{fmt(r['mean'])}</td><td>{fmt(r['variance'])}</td>"
            )
            body += f"<tr>{cells}</tr>"
    layer_tables = (
        "<h2>Batch results</h2>\n"
        f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>\n"
    )

    # --- differences table ---
    diff_rows = [
        [pair] + [fmt(list(d.values())[0]) for d in diffs]
        for pair, diffs in data["differences"].items()
    ]
    diff_table = "<h2>Differences (median, ms)</h2>\n" + table(
        ["comparison"] + [str(b) for b in batch_sizes], diff_rows
    ).replace("<table>", "<table class='diff'>")

    # --- environment table ---
    env_rows = [
        [k, json.dumps(v) if isinstance(v, (dict, list)) else str(v)]
        for k, v in data.get("env", {}).items()
    ]
    env_table = "<h2>Environment</h2>\n" + table(
        ["key", "value"], env_rows
    ).replace("<table>", "<table class='env'>")

    style = (
        "body{font-family:system-ui,sans-serif;margin:2rem;color:#222}"
        "h2{margin-top:1.5rem}"
        "table{border-collapse:collapse;margin-bottom:1rem}"
        "th,td{border:1px solid #ccc;padding:4px 10px;text-align:right}"
        "th{background:#f4f4f4}"
        "td.layer,th:first-child{text-align:left}"
        "table.diff td:first-child{text-align:left}"
        "table.env td{text-align:left;font-family:ui-monospace,monospace;font-size:0.9em}"
        "table.env td:last-child{max-width:60ch;overflow-wrap:anywhere}"
    )

    html = (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<title>Benchmark results</title><style>{style}</style></head>"
        f"<body>\n<h1>Benchmark results</h1>\n{layer_tables}{diff_table}\n{env_table}\n</body></html>"
    )
    with open("bench_results.html", "w") as f:
        f.write(html)

    print("report written to bench_results.html")
    return html


def generate_tex(results_path: str = "bench_results.json", output_path='bench-results.tex'):
    with open(results_path) as f:
        data = json.load(f)
    
    layers = [f'L{i}' for i in range(4)]
    batch_sizes = [1, 100, 10_000, 200_000, 1_000_000, 5_000_000]
    tex = r'''
\begin{table}[htbp]
    \centering
    \begin{tabular}{@{}lrrrr@{}}
        \toprule
        Batch size $N$ & L0 core & L1 wrapper & L2 execution request & L3 full
        action \\
        \midrule
'''
    for bs in batch_sizes:
        tex += f'\n        {bs}'
        i = next(i for i, r in enumerate(data[layers[0]]) if r['batch_size'] == bs)
        for layer in layers:
            assert data[layer][i]['batch_size'] == bs, "Batch sizes do not match"
            tex += f' & {data[layer][i]["median"]:.2f}'
        tex += ' \\\\\n'
    tex += r'''
        \bottomrule
    \end{tabular}
    \caption{Wall-clock time per batch, in milliseconds, at each layer
    (median of \benchruns{} repetitions).}%
    \label{tab:batch-wallclock}
\end{table}
'''

    # What each step up the stack costs, as a factor rather than a difference:
    # the vertical gap between two lines on the logarithmic axes of the figure
    # is their ratio. data["differences"] holds subtractions, so the ratios are
    # taken from the medians here.
    medians = {
        layer: {r['batch_size']: r['median'] for r in data[layer]}
        for layer in layers
    }
    steps = list(zip(layers[1:], layers))
    tex += r'''
\begin{table}[htbp]
    \centering
    \begin{tabular}{@{}lrrr@{}}
        \toprule
        Batch size $N$ & $L_1/L_0$ & $L_2/L_1$ & $L_3/L_2$ \\
        \midrule
'''
    for bs in batch_sizes:
        tex += f'\n        {bs}'
        for upper, lower in steps:
            tex += f' & {medians[upper][bs] / medians[lower][bs]:.2f}'
        tex += ' \\\\\n'
    tex += r'''
        \bottomrule
    \end{tabular}
    \caption{Cost of each step up the stack as a factor, $L_i/L_{i-1}$, from
    the medians of \cref{tab:batch-wallclock}. A value of 1 means the step is
    free at that batch size.}%
    \label{tab:batch-ratios}
\end{table}
'''

    with open(output_path, 'w') as f:
        f.write(tex)
    print(f"TeX tables written to {output_path}")
    paths.publish(output_path, "bench_results_tex")
    return tex

if __name__ == "__main__":
    generate_tex()
     