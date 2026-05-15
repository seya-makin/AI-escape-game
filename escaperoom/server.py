"""
Flask entry point.
Run:  python server.py
Open: http://localhost:5000
"""

from flask import Flask, jsonify, request
from ai.state           import GameState
from ai.algorithms       import ALGORITHMS
from ai.genetic          import PuzzleGA
from ai.puzzle_config    import PuzzleConfig, Stage
from ai.dynamic_solver   import solve_ga

app = Flask(__name__, static_folder='static', static_url_path='')


@app.route('/')
def index():
    return app.send_static_file('index.html')


# ── Classical search ──────────────────────────────────────────────────────────

@app.route('/api/solve', methods=['POST'])
def solve():
    data      = request.get_json(force=True)
    algo_name = data.get('algorithm', 'A*')

    if algo_name not in ALGORITHMS:
        return jsonify({'error': f'Unknown algorithm: {algo_name}'}), 400

    plan, stats = ALGORITHMS[algo_name](GameState.initial())
    return jsonify({
        'plan':  [a.name for a in plan] if plan else [],
        'stats': stats,
    })


# ── GA puzzle generation ──────────────────────────────────────────────────────

@app.route('/api/generate', methods=['POST'])
def generate():
    """
    Run the Genetic Algorithm to evolve an escape-room puzzle for the
    requested difficulty level.

    Request body (JSON):
        { "difficulty": "easy" | "medium" | "hard" }

    Response (JSON):
        {
          "puzzle":   { ...PuzzleConfig fields... },
          "ga_stats": { ...GA run statistics...   }
        }
    """
    data       = request.get_json(force=True)
    difficulty = data.get('difficulty', 'medium')
    if difficulty not in ('easy', 'medium', 'hard'):
        difficulty = 'medium'

    ga          = PuzzleGA(difficulty=difficulty)
    config, stats = ga.run()

    if config is None:
        return jsonify({'error': 'GA failed to produce a solvable puzzle'}), 500

    return jsonify({
        'puzzle':   config.to_dict(),
        'ga_stats': stats,
    })


# ── Classical search on a GA-evolved puzzle ───────────────────────────────────

@app.route('/api/solve_ga', methods=['POST'])
def solve_ga_route():
    """
    Run the selected classical algorithm (BFS/DFS/UCS/A*) on a GA puzzle config
    sent from the browser.

    Request:   { "puzzle": { ...PuzzleConfig dict... }, "algorithm": "A*" }
    Response:  { "plan": [...], "stats": {...}, "solvable": bool }
    """
    data   = request.get_json(force=True)
    puzzle = data.get('puzzle') or {}
    algo   = data.get('algorithm', 'A*')

    try:
        stages = [Stage(**s) for s in puzzle.get('stages', [])]
    except TypeError:
        return jsonify({'error': 'Malformed puzzle stages.'}), 400
    if not stages:
        return jsonify({'error': 'Empty puzzle.'}), 400

    config = PuzzleConfig(stages=stages)
    plan, stats, ok = solve_ga(config, algo)

    return jsonify({'plan': plan, 'stats': stats, 'solvable': ok})


if __name__ == '__main__':
    print('\n  Escape Room AI  —  http://localhost:5000\n')
    app.run(debug=False, port=5000)
