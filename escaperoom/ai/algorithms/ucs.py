import heapq
import time
from ai.state import GameState
from ai.actions import get_all_actions


def ucs(initial_state: GameState):
    """Uniform-Cost Search — optimal for varying action costs."""
    t0 = time.perf_counter()
    actions = get_all_actions()

    counter   = 0
    frontier  = [(0.0, counter, initial_state, [])]
    seen      = {initial_state}          # mark at generation time (same as BFS)
    expanded  = 0
    max_front = 1

    while frontier:
        g, _, state, plan = heapq.heappop(frontier)
        expanded += 1

        if state.is_goal():
            return plan, _stats('UCS', expanded, len(plan), t0, max_front)

        for a in actions:
            if a.is_applicable(state):
                ns = a.apply(state)
                if ns not in seen:
                    seen.add(ns)
                    counter += 1
                    heapq.heappush(frontier, (g + a.cost, counter, ns, plan + [a]))
                    if len(frontier) > max_front:
                        max_front = len(frontier)

    return None, _stats('UCS', expanded, 0, t0, max_front)


def _stats(algo, expanded, length, t0, max_front):
    return {
        'algorithm':        algo,
        'nodes_expanded':   expanded,
        'plan_length':      length,
        'time_ms':          round((time.perf_counter() - t0) * 1000, 3),
        'max_frontier':     max_front,
    }
