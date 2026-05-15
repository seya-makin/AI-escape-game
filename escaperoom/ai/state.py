from __future__ import annotations
from dataclasses import dataclass
from typing import FrozenSet


@dataclass(frozen=True)
class GameState:
    player_location: str
    inventory: FrozenSet[str]
    drawer_locked: bool
    cabinet_locked: bool
    safe_locked: bool
    exit_locked: bool
    small_key_collected: bool
    cabinet_key_collected: bool
    code_known: bool
    master_key_collected: bool

    # ── factory ──────────────────────────────────────────────────────────────
    @staticmethod
    def initial() -> GameState:
        return GameState(
            player_location='start_area',
            inventory=frozenset(),
            drawer_locked=True,
            cabinet_locked=True,
            safe_locked=True,
            exit_locked=True,
            small_key_collected=False,
            cabinet_key_collected=False,
            code_known=False,
            master_key_collected=False,
        )

    # ── goal test ─────────────────────────────────────────────────────────────
    def is_goal(self) -> bool:
        return self.player_location == 'exit_area' and not self.exit_locked

    # ── helpers ───────────────────────────────────────────────────────────────
    def __str__(self) -> str:
        inv  = ', '.join(sorted(self.inventory)) or 'empty'
        lock = [n for n, v in [('drawer', self.drawer_locked),
                                ('cabinet', self.cabinet_locked),
                                ('safe', self.safe_locked),
                                ('exit', self.exit_locked)] if v]
        return (f"loc={self.player_location:<14} "
                f"inv=[{inv}]  "
                f"locked=[{', '.join(lock)}]")
