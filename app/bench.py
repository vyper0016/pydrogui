'''
L0        step_monitor_mem loop   in-process, local
L1        machine.run_for_steps   in-process, local
L2        /api/run                local API
L3        /api/run                local API + the GET requests the frontend
                                  issues afterwards to refresh its views

All four layers run in this process against the local API, so every pair is
comparable.

L3 replays what the frontend does after a run completes:
  GET /api/memory-history                          accumulated memory access log
  GET /api/read-registers-batch?reg_names=all      standard register set
  GET /api/disassemble-last-instruction            instruction just executed
  GET /api/read-term?offset=<offset>               guest console bytes since last read
  GET /api/read-memory-page/<addr>                 memory page currently on screen
The GETs are issued sequentially, so L3 - L2 is the total server cost of a
view refresh rather than the wall-clock the browser sees when it parallelises.

Every recorded timing is in milliseconds; variances are therefore in ms².
'''
import time
import requests
import json
from _pydrofoil import RISCV64
from machine import Machine
import statistics
from typing import Callable
import bench_env
from bench_generators import generate_report

#/pypy/pypy-pydrofoil-scripting-experimental/bin/pypy /app/bench.py

BATCH_SIZES = [1, 10, 100, 1000, 10_000, 100_000, 200_000, 1_000_000, 5_000_000]
LINUX_BINARY = '/app/static/binary_examples/linux_kernel.bbl'
LINUX_BINARY_ID = "example:linux_kernel.bbl"
ROUNDING = 5
ROUND = True

LOCAL_API_URL = "http://localhost:8000/api"

# Address the memory view sits on by default (frontend falls back to 0x0).
MEM_PAGE_ADDR = "0x0"

COMPARISONS = (
    ('L1', 'L0'),
    ('L2', 'L0'),
    ('L2', 'L1'),
    ('L3', 'L2'),
)

def _round(value):
    if ROUND:
        return round(value, ROUNDING)
    return value

def _ms(seconds:float) -> float:
    '''perf_counter deltas are seconds; every recorded timing is milliseconds.'''
    return _round(seconds * 1000)

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

def update_views(api_url:str, headers:dict, term_offset:int = 0) -> int:
    '''
    The GETs the frontend fires after a run to refresh its views.
    Returns the new terminal offset, as the frontend tracks it.
    '''
    for path in (
        "/memory-history",
        "/read-registers-batch?reg_names=all",
        "/disassemble-last-instruction",
    ):
        r = requests.get(f"{api_url}{path}", headers=headers)
        r.raise_for_status()

    r = requests.get(f"{api_url}/read-term?offset={term_offset}", headers=headers)
    term_offset = r.json()["next_offset"]

    r = requests.get(f"{api_url}/read-memory-page/{MEM_PAGE_ADDR}", headers=headers)
    return term_offset

def bench_23(api_url:str, sample_size:int = 5, updates:bool = False) -> list:
    '''Time POST /run per batch size; with updates=True the view-refresh GETs count too.'''
    # test api call
    r = requests.get(f"{api_url}/binaries/examples")
    r.raise_for_status()

    results = []
    for batch_size in BATCH_SIZES:
        batch_results = {"batch_size": batch_size, "times": []}
        for i in range(sample_size+1):
            sid = init_l23(api_url)
            headers = {"X-Session-Id": sid}
            start = time.perf_counter()
            r = requests.post(f"{api_url}/run?steps={batch_size}", headers=headers)
            if updates:
                update_views(api_url, headers)
            elapsed_time = time.perf_counter() - start
            if i > 0:  # Skip the first run for warm-up
                batch_results["times"].append(_ms(elapsed_time))
            else:
                r.raise_for_status()
            cleanup_l23(api_url, sid)
        batch_results["median"] = _round(statistics.median(batch_results["times"]))
        batch_results["mean"] = _round(statistics.mean(batch_results["times"]))
        batch_results['variance'] = 0
        if len(batch_results["times"]) > 1:
            batch_results['variance'] = _round(statistics.variance(batch_results["times"]))
        results.append(batch_results)

    return results

def bench_01(init_func:Callable, inner_func:Callable, sample_size:int = 5) -> list:
    results = []
    for batch_size in BATCH_SIZES:
        batch_results = {"batch_size": batch_size, "times": []}
        for i in range(sample_size+1):
            machine = init_func()
            start_time = time.perf_counter()
            inner_func(machine, batch_size)
            elapsed_time = time.perf_counter() - start_time
            del machine
            if i > 0:  # Skip the first run for warm-up
                batch_results["times"].append(_ms(elapsed_time))
        batch_results["median"] = _round(statistics.median(batch_results["times"]))
        batch_results["mean"] = _round(statistics.mean(batch_results["times"]))
        batch_results['variance'] = 0
        if len(batch_results["times"]) > 1:
            batch_results['variance'] = _round(statistics.variance(batch_results["times"]))
        results.append(batch_results)

    return results

def compute_differences(results:dict) -> dict:
    '''
    Median deltas in milliseconds for the layer pairs listed in COMPARISONS.
    '''
    differences = {}
    for layer, other_layer in COMPARISONS:
        deltas = []
        for i in range(len(results[layer])):
            batch_size = results[layer][i]['batch_size']
            assert batch_size == results[other_layer][i]['batch_size'], "Batch sizes do not match"

            diff = results[layer][i]['median'] - results[other_layer][i]['median']
            deltas.append({str(batch_size): _round(diff)})
        differences[f"{layer} - {other_layer}"] = deltas
    return differences


def run_benchs(sample_size:int = 5, api_url:str = LOCAL_API_URL, save_path:str | None = None) -> dict:

    env = bench_env.collect_env(
        batch_sizes=BATCH_SIZES,
        sample_size=sample_size,
        binary=LINUX_BINARY_ID,
        time_unit="ms",
    )
    results = {"env": env}
    print('running L0')
    results["L0"] = bench_01(init_l0, inner_l0, sample_size)
    print('running L1')
    results["L1"] = bench_01(init_l1, inner_l1, sample_size)
    print('running L2')
    results["L2"] = bench_23(api_url, sample_size)
    print('running L3')
    results["L3"] = bench_23(api_url, sample_size, updates=True)

    results['differences'] = compute_differences(results)

    print('benchmark done')
    if save_path:
        with open(save_path, "w") as f:
            json.dump(results, f, indent=2)

    return results


if __name__ == "__main__":
    SAMPLE_SIZE = 30
    RESULTS_PATH = "bench_results.json"
    print(f'running benchmark.\nbatch_sizes={BATCH_SIZES}\nsample_size={SAMPLE_SIZE}')
    run_benchs(SAMPLE_SIZE, api_url=LOCAL_API_URL, save_path=RESULTS_PATH)

    generate_report(RESULTS_PATH)
    print('report generated')