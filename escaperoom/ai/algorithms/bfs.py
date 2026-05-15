from collections import deque
import time
from ai.state import GameState
from ai.actions import get_all_actions


def bfs(initial_state: GameState):
    """Breadth-First Search — complete & optimal under uniform cost."""
    t0 = time.perf_counter()
    actions = get_all_actions()

    frontier  = deque([(initial_state, [])])
    explored  = {initial_state}
    expanded  = 0
    max_front = 1

    while frontier:
        state, plan = frontier.popleft()
        expanded += 1

        if state.is_goal():
            return plan, _stats('BFS', expanded, len(plan), t0, max_front)

        for a in actions:
            if a.is_applicable(state):
                ns = a.apply(state)
                if ns not in explored:
                    explored.add(ns)
                    frontier.append((ns, plan + [a]))
                    if len(frontier) > max_front:
                        max_front = len(frontier)

    return None, _stats('BFS', expanded, 0, t0, max_front)


def _stats(algo, expanded, length, t0, max_front):
    return {
        'algorithm':        algo,
        'nodes_expanded':   expanded,
        'plan_length':      length,
        'time_ms':          round((time.perf_counter() - t0) * 1000, 3),
        'max_frontier':     max_front,
    }
