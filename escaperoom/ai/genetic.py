"""
Genetic Algorithm for escape-room puzzle generation.

Architecture
------------
Chromosome : a list of gene dicts  [{'item_area': str, 'lock_area': str}, ...]
             The last gene always has lock_area = 'exit_area'.

Fitness    : calls solve_dynamic(config) via A* to obtain:
               - solvable (bool)   — unsolvable → fitness 0
               - plan_length (int) — compared against difficulty target range
             Then adds bonuses for area diversity and puzzle depth.

Selection  : tournament (size TOURN_K)
Crossover  : single-point on the stage list
Mutation   : per-gene area replacement; random stage insertion / deletion

The GA returns the best PuzzleConfig found and a statistics dict that
is forwarded to the browser for display.
"""
from __future__ import annotations

import random
import time
from typing import List, Optional, Tuple

from ai.puzzle_config import PLAY_AREAS, PuzzleConfig, Stage
from ai.dynamic_solver import solve_dynamic

# (inclusive) target plan-length windows per difficulty
_TARGETS: dict[str, tuple[int, int]] = {
    'easy':   (6,  10),
    'medium': (10, 14),
    'hard':   (14, 20),
}

# type alias
Chromosome = List[dict]


class PuzzleGA:
    """
    Genetic Algorithm that evolves escape-room puzzle configurations.

    Each individual encodes a puzzle as a sequence of (item_area, lock_area)
    pairs.  The A* solver in dynamic_solver.py acts as the fitness oracle,
    ensuring every evaluated puzzle is either provably solvable (and scored
    by difficulty) or penalised with fitness 0.
    """

    POPULATION  = 20
    GENERATIONS = 40
    P_MUTATE    = 0.30   # per-gene mutation probability
    P_CROSSOVER = 0.75   # crossover probability
    ELITISM     = 2      # top-N elites copied unchanged each generation
    TOURN_K     = 3      # tournament size

    def __init__(self, difficulty: str = 'medium', seed: int | None = None):
        if difficulty not in _TARGETS:
            difficulty = 'medium'
        self.difficulty  = difficulty
        self.target_min, self.target_max = _TARGETS[difficulty]
        self._rng = random.Random(seed)   # local RNG (reproducible if seeded)

    # ── Chromosome helpers ────────────────────────────────────────────────────

    def _random_chrom(self) -> Chromosome:
        """Create a random valid chromosome."""
        n = self._rng.choice(
            [2, 3]    if self.difficulty == 'easy'   else
            [3, 4]    if self.difficulty == 'medium' else
            [4, 5]
        )
        stages = []
        for i in range(n):
            stages.append({
                'item_area': self._rng.choice(PLAY_AREAS),
                # Only the last stage's lock is the exit; others are in play areas
                'lock_area': 'exit_area' if i == n - 1 else self._rng.choice(PLAY_AREAS),
            })
        return stages

    def _to_config(self, chrom: Chromosome) -> PuzzleConfig:
        """Convert a chromosome to a PuzzleConfig (without evaluation)."""
        stages = []
        n = len(chrom)
        for i, gene in enumerate(chrom):
            is_last = (i == n - 1)
            stages.append(Stage(
                item_name = 'master_key' if is_last else f'key_{i}',
                item_area = gene['item_area'],
                lock_name = 'exit'       if is_last else f'lock_{i}',
                lock_area = gene['lock_area'],
            ))
        return PuzzleConfig(stages=stages)

    # ── Fitness ───────────────────────────────────────────────────────────────

    def _fitness(self, chrom: Chromosome) -> Tuple[float, PuzzleConfig]:
        """
        Evaluate a chromosome.

        Scoring breakdown (max ≈ 122):
          20  — base solvable bonus
          50  — full marks if plan_length ∈ [target_min, target_max]
          28  — area diversity (up to 4 distinct areas × 7)
          24  — puzzle depth (up to 6 stages × 4, via mutation/crossover)
        """
        config = self._to_config(chrom)
        plan_len, nodes, ok = solve_dynamic(config)

        config.plan_length    = plan_len
        config.nodes_expanded = nodes
        config.solvable       = ok

        if not ok:
            config.fitness = 0.0
            return 0.0, config

        # Length score
        lo, hi = self.target_min, self.target_max
        if lo <= plan_len <= hi:
            length_score = 50.0
        elif plan_len < lo:
            length_score = max(0.0, 50.0 - (lo - plan_len) * 8.0)
        else:
            length_score = max(0.0, 50.0 - (plan_len - hi)  * 5.0)

        # Diversity: distinct areas used across all stages
        all_areas    = {g['item_area'] for g in chrom} | {g['lock_area'] for g in chrom}
        diversity    = len(all_areas) * 7.0          # up to 28 (4 distinct areas)

        # Depth: longer chains = richer puzzle
        depth_score  = len(chrom) * 4.0              # up to 20 (5 stages)

        total = 20.0 + length_score + diversity + depth_score
        config.fitness = round(total, 2)
        return total, config

    # ── Genetic operators ─────────────────────────────────────────────────────

    def _tournament(self, pop_fit: List[Tuple[float, Chromosome]]) -> Chromosome:
        sample = self._rng.sample(pop_fit, min(self.TOURN_K, len(pop_fit)))
        return max(sample, key=lambda x: x[0])[1]

    def _crossover(self, p1: Chromosome, p2: Chromosome) -> Chromosome:
        """Single-point crossover on the stage list."""
        if self._rng.random() > self.P_CROSSOVER or len(p1) < 2 or len(p2) < 2:
            return [dict(g) for g in p1]
        cut1 = self._rng.randint(1, len(p1) - 1)
        cut2 = self._rng.randint(1, len(p2) - 1)
        child = [dict(g) for g in p1[:cut1]] + [dict(g) for g in p2[cut2:]]
        child[-1]['lock_area'] = 'exit_area'   # invariant: last lock is exit
        return child

    def _mutate(self, chrom: Chromosome) -> Chromosome:
        """Per-gene mutation + occasional stage insertion/deletion."""
        c = [dict(g) for g in chrom]

        for i in range(len(c)):
            if self._rng.random() < self.P_MUTATE:
                c[i]['item_area'] = self._rng.choice(PLAY_AREAS)
            # Don't mutate the last stage's lock (must stay 'exit_area')
            if i < len(c) - 1 and self._rng.random() < self.P_MUTATE:
                c[i]['lock_area'] = self._rng.choice(PLAY_AREAS)

        # Random stage insertion (15 %)
        if self._rng.random() < 0.15 and len(c) < 5:
            pos = self._rng.randint(0, len(c) - 1)
            c.insert(pos, {
                'item_area': self._rng.choice(PLAY_AREAS),
                'lock_area': self._rng.choice(PLAY_AREAS),
            })

        # Random stage deletion (15 %)
        if self._rng.random() < 0.15 and len(c) > 2:
            pos = self._rng.randint(0, len(c) - 2)   # never remove last
            c.pop(pos)

        c[-1]['lock_area'] = 'exit_area'   # re-assert invariant
        return c

    # ── Main loop ─────────────────────────────────────────────────────────────

    def run(self) -> Tuple[Optional[PuzzleConfig], dict]:
        """
        Execute the GA.

        Returns
        -------
        best_config : PuzzleConfig | None — champion individual (None only if
                      population size is 0, which never happens in practice)
        stats       : dict — metrics for display in the browser UI
        """
        t0 = time.perf_counter()

        population = [self._random_chrom() for _ in range(self.POPULATION)]

        best_config: Optional[PuzzleConfig] = None
        best_fit    = -1.0
        history: List[float] = []   # best fitness per generation

        for gen in range(self.GENERATIONS):
            # ── Evaluate ────────────────────────────────────────────────────
            eval_results = [self._fitness(c) for c in population]
            fitnesses    = [f  for f, _   in eval_results]
            configs      = [cfg for _, cfg in eval_results]

            gen_best_idx = max(range(len(fitnesses)), key=lambda i: fitnesses[i])
            gen_best_fit = fitnesses[gen_best_idx]
            history.append(round(gen_best_fit, 2))

            if gen_best_fit > best_fit:
                best_fit             = gen_best_fit
                best_config          = configs[gen_best_idx]
                best_config.generation = gen + 1   # 1-based for display

            # ── Build next generation ────────────────────────────────────
            pop_fit   = list(zip(fitnesses, population))
            sorted_pf = sorted(pop_fit, key=lambda x: x[0], reverse=True)

            new_pop: Chromosome = [sorted_pf[i][1] for i in range(self.ELITISM)]

            while len(new_pop) < self.POPULATION:
                p1    = self._tournament(pop_fit)
                p2    = self._tournament(pop_fit)
                child = self._crossover(p1, p2)
                child = self._mutate(child)
                new_pop.append(child)

            population = new_pop

        elapsed = round((time.perf_counter() - t0) * 1000, 1)

        stats = {
            'difficulty':       self.difficulty,
            'generations':      self.GENERATIONS,
            'population_size':  self.POPULATION,
            'best_fitness':     round(best_fit, 2),
            'plan_length':      best_config.plan_length    if best_config else 0,
            'nodes_expanded':   best_config.nodes_expanded if best_config else 0,
            'num_stages':       len(best_config.stages)    if best_config else 0,
            'generation_found': best_config.generation     if best_config else 0,
            'fitness_history':  history,
            'time_ms':          elapsed,
        }
        return best_config, stats
