from __future__ import annotations
from dataclasses import replace
from typing import List
from ai.state import GameState

REGIONS = ['start_area', 'desk_area', 'cabinet_area', 'safe_area', 'exit_area']


# ── Base class ────────────────────────────────────────────────────────────────
class Action:
    def __init__(self, name: str, cost: float = 1.0):
        self.name = name
        self.cost = cost

    def is_applicable(self, state: GameState) -> bool:
        raise NotImplementedError

    def apply(self, state: GameState) -> GameState:
        raise NotImplementedError

    def __repr__(self) -> str:
        return f"Action({self.name})"


# ── Movement ──────────────────────────────────────────────────────────────────
class MoveAction(Action):
    def __init__(self, destination: str):
        super().__init__(f"move_to_{destination}", cost=1.0)
        self.destination = destination

    def is_applicable(self, state: GameState) -> bool:
        return state.player_location != self.destination

    def apply(self, state: GameState) -> GameState:
        return replace(state, player_location=self.destination)


# ── Object interactions ───────────────────────────────────────────────────────
class PickUpSmallKey(Action):
    def __init__(self):
        super().__init__("pick_up_small_key")

    def is_applicable(self, state: GameState) -> bool:
        return state.player_location == 'desk_area' and not state.small_key_collected

    def apply(self, state: GameState) -> GameState:
        return replace(state,
                       inventory=state.inventory | {'small_key'},
                       small_key_collected=True)


class UnlockDrawer(Action):
    def __init__(self):
        super().__init__("unlock_drawer")

    def is_applicable(self, state: GameState) -> bool:
        return (state.player_location == 'desk_area'
                and 'small_key' in state.inventory
                and state.drawer_locked)

    def apply(self, state: GameState) -> GameState:
        return replace(state, drawer_locked=False)


class PickUpCabinetKey(Action):
    def __init__(self):
        super().__init__("pick_up_cabinet_key")

    def is_applicable(self, state: GameState) -> bool:
        return (state.player_location == 'desk_area'
                and not state.drawer_locked
                and not state.cabinet_key_collected)

    def apply(self, state: GameState) -> GameState:
        return replace(state,
                       inventory=state.inventory | {'cabinet_key'},
                       cabinet_key_collected=True)


class UnlockCabinet(Action):
    def __init__(self):
        super().__init__("unlock_cabinet")

    def is_applicable(self, state: GameState) -> bool:
        return (state.player_location == 'cabinet_area'
                and 'cabinet_key' in state.inventory
                and state.cabinet_locked)

    def apply(self, state: GameState) -> GameState:
        return replace(state, cabinet_locked=False)


class ReadCode(Action):
    def __init__(self):
        super().__init__("read_code")

    def is_applicable(self, state: GameState) -> bool:
        return (state.player_location == 'cabinet_area'
                and not state.cabinet_locked
                and not state.code_known)

    def apply(self, state: GameState) -> GameState:
        return replace(state, code_known=True)


class EnterCodeSafe(Action):
    def __init__(self):
        super().__init__("enter_code_safe")

    def is_applicable(self, state: GameState) -> bool:
        return (state.player_location == 'safe_area'
                and state.code_known
                and state.safe_locked)

    def apply(self, state: GameState) -> GameState:
        return replace(state, safe_locked=False)


class PickUpMasterKey(Action):
    def __init__(self):
        super().__init__("pick_up_master_key")

    def is_applicable(self, state: GameState) -> bool:
        return (state.player_location == 'safe_area'
                and not state.safe_locked
                and not state.master_key_collected)

    def apply(self, state: GameState) -> GameState:
        return replace(state,
                       inventory=state.inventory | {'master_key'},
                       master_key_collected=True)


class UnlockExit(Action):
    def __init__(self):
        super().__init__("unlock_exit")

    def is_applicable(self, state: GameState) -> bool:
        return (state.player_location == 'exit_area'
                and 'master_key' in state.inventory
                and state.exit_locked)

    def apply(self, state: GameState) -> GameState:
        return replace(state, exit_locked=False)


# ── Action library ────────────────────────────────────────────────────────────
def get_all_actions() -> List[Action]:
    moves   = [MoveAction(r) for r in REGIONS]
    objects = [
        PickUpSmallKey(),
        UnlockDrawer(),
        PickUpCabinetKey(),
        UnlockCabinet(),
        ReadCode(),
        EnterCodeSafe(),
        PickUpMasterKey(),
        UnlockExit(),
    ]
    return moves + objects
