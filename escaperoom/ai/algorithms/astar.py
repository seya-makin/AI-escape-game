import heapq
import time
from ai.state import GameState
from ai.actions import get_all_actions


def heuristic(s: GameState) -> int:
    """
    Admissible & consistent heuristic.

    Counts the number of prerequisite conditions still unsatisfied.
    Each condition requires at least one distinct action to resolve,
    so this never overestimates the true remaining cost.

    Consistency: h(n) <= cost(n->n') + h(n') because each action
    can resolve at most one condition (h decreases by at most 1 per step).
    """
    h = 0
    if not s.small_key_collected:   h += 1   # need: pick_up_small_key
    if s.drawer_locked:             h += 1   # need: unlock_drawer
    if not s.cabinet_key_collected: h += 1   # need: pick_up_cabinet_key
    if s.cabinet_locked:            h += 1   # need: unlock_cabinet
    if not s.code_known:            h += 1   # need: read_code
    if s.safe_locked:               h += 1   # need: enter_code_safe
    if not s.master_key_collected:  h += 1   # need: pick_up_master_key
    if s.exit_locked:               h += 1   # need: unlock_exit
    if s.player_location != 'exit_area': h += 1  # need: at least one move
    return h


def astar(initial_state: GameState):
    """A* Search — optimal with admissible + consistent heuristic."""
    t0 = time.perf_counter()
    actions = get_all_actions()

    counter   = 0
    h0        = heuristic(initial_state)
    frontier  = [(h0, counter, 0.0, initial_state, [])]
    seen      = {initial_state}          # mark at generation time (same as BFS)
    expanded  = 0
    max_front = 1

    while frontier:
        f, _, g, state, plan = heapq.heappop(frontier)
        expanded += 1

        if state.is_goal():
            return plan, _stats('A*', expanded, len(plan), t0, max_front)

        for a in actions:
            if a.is_applicable(state):
                ns = a.apply(state)
                if ns not in seen:
                    seen.add(ns)
                    counter += 1
                    h = heuristic(ns)
                    heapq.heappush(frontier, (g + a.cost + h, counter, g + a.cost, ns, plan + [a]))
                    if len(frontier) > max_front:
                        max_front = len(frontier)

    return None, _stats('A*', expanded, 0, t0, max_front)


def _stats(algo, expanded, length, t0, max_front):
    return {
        'algorithm':        algo,
        'nodes_expanded':   expanded,
        'plan_length':      length,
        'time_ms':          round((time.perf_counter() - t0) * 1000, 3),
        'max_frontier':     max_front,
    }
