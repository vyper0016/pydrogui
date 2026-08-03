'''
L0 run
L1 machine.run_for_steps
L2 /api/step-mem
L3 /api/step-mem remote
'''
import time
import requests
import json
from _pydrofoil import RISCV64
from machine import Machine
import statistics
from typing import Callable

#/pypy/pypy-pydrofoil-scripting-experimental/bin/pypy /app/bench.py

BATCH_SIZES = [1, 100, 100_000, 200_000, 1_500_000]
LINUX_BINARY = '/app/static/binary_examples/linux_kernel.bbl'
LINUX_BINARY_ID = "example:linux_kernel.bbl"
SAMPLE_SIZE = 3
ROUNDING = 5
ROUND = True

def _round(value):
    if ROUND:
        return round(value, ROUNDING)
    return value

def init_l0(): 
    m = RISCV64(LINUX_BINARY, dtb=True)
    m.set_verbosity(0)
    return m
    
def inner_l0(machine, batch_size):
    for _ in range(batch_size):
        machine.step_monitor_mem()

def init_l1():
    return Machine(LINUX_BINARY)

def inner_l1(machine, batch_size):

    machine.run_for_steps(batch_size)
 
def init_l23(api_url:str): 
    r = requests.post(f"{api_url}/sessions?binary_id={LINUX_BINARY_ID}")
    r.raise_for_status()
    return r.json()['session_id']

def cleanup_l23(api_url:str, sid:str):
    r = requests.delete(f"{api_url}/sessions/{sid}")
    r.raise_for_status()

def bench_23(api_url:str) -> list:
    # test api call
    r = requests.get(f"{api_url}/binaries/examples")
    r.raise_for_status()
    
    results = []
    for batch_size in BATCH_SIZES:
        batch_results = {"batch_size": batch_size, "times": []}
        for i in range(SAMPLE_SIZE+1):
            sid = init_l23(api_url)
            start = time.perf_counter()
            r = requests.post(f"{api_url}/run?steps={batch_size}", headers={"X-Session-Id": sid})
            elapsed_time = time.perf_counter() - start
            r.raise_for_status()
            if i > 0:  # Skip the first run for warm-up
                batch_results["times"].append(_round(elapsed_time))
            cleanup_l23(api_url, sid)
        batch_results["median"] = _round(statistics.median(batch_results["times"]))
        batch_results["mean"] = _round(statistics.mean(batch_results["times"]))
        batch_results['variance'] = _round(statistics.variance(batch_results["times"]))
        results.append(batch_results)

    return results

def bench_01(init_func:Callable, inner_func:Callable) -> list:
    results = []
    for batch_size in BATCH_SIZES:
        batch_results = {"batch_size": batch_size, "times": []}
        for i in range(SAMPLE_SIZE):
            machine = init_func()
            start_time = time.perf_counter()
            inner_func(machine, batch_size)
            elapsed_time = time.perf_counter() - start_time
            if i > 0:  # Skip the first run for warm-up
                batch_results["times"].append(_round(elapsed_time))
        batch_results["median"] = _round(statistics.median(batch_results["times"]))
        batch_results["mean"] = _round(statistics.mean(batch_results["times"]))
        batch_results['variance'] = _round(statistics.variance(batch_results["times"]))
        results.append(batch_results)

    return results

def generate_report(results_path: str = "bench_results.json") -> str:
    '''generate an HTML report from the benchmark results JSON file - AI generated function code'''
    with open(results_path) as f:
        data = json.load(f)

    layers = [k for k in data if k != "differences"]
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
    headers = ["layer", "batch_size", "median (s)", "mean (s)", "variance"]
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
    diff_table = "<h2>Differences (median, s)</h2>\n" + table(
        ["comparison"] + [str(b) for b in batch_sizes], diff_rows
    ).replace("<table>", "<table class='diff'>")

    style = (
        "body{font-family:system-ui,sans-serif;margin:2rem;color:#222}"
        "h2{margin-top:1.5rem}"
        "table{border-collapse:collapse;margin-bottom:1rem}"
        "th,td{border:1px solid #ccc;padding:4px 10px;text-align:right}"
        "th{background:#f4f4f4}"
        "td.layer,th:first-child{text-align:left}"
        "table.diff td:first-child{text-align:left}"
    )

    html = (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<title>Benchmark results</title><style>{style}</style></head>"
        f"<body>\n<h1>Benchmark results</h1>\n{layer_tables}{diff_table}\n</body></html>"
    )
    with open("bench_results.html", "w") as f:
        f.write(html)

    print("report written to bench_results.html")


if __name__ == "__main__":

    results = {}
    results["L0"] = bench_01(init_l0, inner_l0)
    results["L1"] = bench_01(init_l1, inner_l1)
    results["L2"] = bench_23("http://localhost:8000/api")
    results["L3"] = bench_23("http://localhost:8000/api") # TODO: change to remote server
    results['differences'] = {}
    layers = ['L0', 'L1', 'L2', 'L3']

    # Compare each layer with the previous layers
    for n, layer in enumerate(layers[1:], start=1):
        for other_layer in layers[:n]:
            differences = []
            for i in range(len(results[layer])):
                batch_size = results[layer][i]['batch_size']
                assert batch_size == results[other_layer][i]['batch_size'], "Batch sizes do not match"
                
                diff = results[layer][i]['median'] - results[other_layer][i]['median']
                differences.append({str(batch_size):  _round(diff)})
            results['differences'][f"{layer} - {other_layer}"] = differences

    print('benchmark done')
    with open("bench_results.json", "w") as f:
        json.dump(results, f, indent=2)

    generate_report("bench_results.json")