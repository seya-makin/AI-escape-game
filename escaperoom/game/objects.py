"""
All interactable 3D objects in the escape room.

Each object has:
  - A 3D entity (box with label)
  - An interact(game_manager) method called when the player presses E
  - Visual feedback (color change) when state changes
"""

from ursina import Entity, Text, Vec3, color, destroy


# ── Colours ───────────────────────────────────────────────────────────────────
C_KEY         = color.rgb(255, 215,   0)   # gold
C_KEY_CABINET = color.rgb( 50, 150, 255)   # azure
C_DRAWER      = color.rgb(110,  70,  30)
C_CABINET_DR  = color.rgb( 80,  50,  20)
C_SAFE_DR     = color.rgb( 45,  45,  45)
C_PAPER       = color.rgb(245, 240, 220)
C_MASTER_KEY  = color.rgb(255, 200,   0)
C_DOOR_LOCK   = color.rgb(200,  50,  50)
C_DOOR_OPEN   = color.rgb( 50, 200,  80)
C_HIGHLIGHT   = color.rgb(255, 255, 100)


class Interactable(Entity):
    """Coloured box with a floating billboard label."""

    def __init__(self, obj_id: str, label: str, base_color, **kwargs):
        super().__init__(model='cube', color=base_color,
                         collider='box', **kwargs)
        self.obj_id       = obj_id
        self._base_color  = base_color
        self._label_str   = label
        self.interactable = True

        self._lbl = Text(
            text=label,
            parent=self,
            position=(0, 1.4, 0),
            scale=12,
            color=color.white,
            billboard=True,
        )

    # ── override in subclasses ────────────────────────────────────────────────
    def interact(self, gm) -> str:
        return ""

    # ── highlight feedback ────────────────────────────────────────────────────
    def highlight(self):
        self.color = C_HIGHLIGHT

    def unhighlight(self):
        self.color = self._base_color

    # ── helpers ───────────────────────────────────────────────────────────────
    def set_label(self, text: str):
        self._label_str = text
        self._lbl.text  = text

    def set_base_color(self, c):
        self._base_color = c
        self.color       = c

    def hide_object(self):
        self.visible      = False
        self.interactable = False
        self._lbl.visible = False

    def show_object(self):
        self.visible      = True
        self.interactable = True
        self._lbl.visible = True


# ─────────────────────────────────────────────────────────────────────────────
#  Concrete objects
# ─────────────────────────────────────────────────────────────────────────────

class SmallKey(Interactable):
    def __init__(self):
        super().__init__('small_key', 'Small Key  [E]',
                         C_KEY,
                         position=Vec3(0.6, 1.12, -6.0),
                         scale=(0.25, 0.06, 0.45))

    def interact(self, gm) -> str:
        if not gm.state.small_key_collected:
            gm.do('pick_up_small_key')
            self.hide_object()
            return "Picked up the Small Key."
        return ""


class Drawer(Interactable):
    def __init__(self):
        super().__init__('drawer', 'Desk Drawer  [LOCKED]',
                         C_DRAWER,
                         position=Vec3(-0.6, 0.62, -5.15),
                         scale=(0.9, 0.22, 0.55))

    def interact(self, gm) -> str:
        if gm.state.drawer_locked:
            if 'small_key' in gm.state.inventory:
                gm.do('unlock_drawer')
                self.set_label('Desk Drawer  [OPEN]')
                self.set_base_color(color.rgb(160, 110, 55))
                gm.cabinet_key.show_object()
                return "Drawer unlocked!  Found a Cabinet Key inside."
            return "Locked — you need a small key."
        return "Already open."


class CabinetKey(Interactable):
    def __init__(self):
        super().__init__('cabinet_key', 'Cabinet Key  [E]',
                         C_KEY_CABINET,
                         position=Vec3(-0.6, 0.74, -5.15),
                         scale=(0.25, 0.06, 0.45))
        self.hide_object()

    def interact(self, gm) -> str:
        if not gm.state.cabinet_key_collected:
            gm.do('pick_up_cabinet_key')
            self.hide_object()
            return "Picked up the Cabinet Key."
        return ""


class Cabinet(Interactable):
    def __init__(self):
        super().__init__('cabinet', 'Cabinet  [LOCKED]',
                         C_CABINET_DR,
                         position=Vec3(8.5, 1.5, 2.05),
                         scale=(1.45, 2.85, 0.18))

    def interact(self, gm) -> str:
        if gm.state.cabinet_locked:
            if 'cabinet_key' in gm.state.inventory:
                gm.do('unlock_cabinet')
                self.set_label('Cabinet  [OPEN]')
                self.set_base_color(color.rgb(140, 95, 45))
                gm.code_paper.show_object()
                return "Cabinet unlocked!  There's a paper inside..."
            return "Locked — you need the cabinet key."
        return "Already open."


class CodePaper(Interactable):
    def __init__(self):
        super().__init__('code_paper', 'Paper: code 4821  [E]',
                         C_PAPER,
                         position=Vec3(8.5, 2.1, 2.3),
                         scale=(0.35, 0.02, 0.5))
        self.hide_object()

    def interact(self, gm) -> str:
        if not gm.state.code_known:
            gm.do('read_code')
            return "Noted the safe code: 4821"
        return "You already know the code: 4821"


class Safe(Interactable):
    def __init__(self):
        super().__init__('safe', 'Safe  [LOCKED]',
                         C_SAFE_DR,
                         position=Vec3(-8.5, 1.5, -0.72),
                         scale=(1.45, 1.45, 0.18))

    def interact(self, gm) -> str:
        if gm.state.safe_locked:
            if gm.state.code_known:
                gm.do('enter_code_safe')
                self.set_label('Safe  [OPEN]')
                self.set_base_color(color.rgb(100, 100, 100))
                gm.master_key.show_object()
                return "Safe opened!  Found the Master Key!"
            return "Locked — you need the safe code."
        return "Already open."


class MasterKey(Interactable):
    def __init__(self):
        super().__init__('master_key', 'Master Key  [E]',
                         C_MASTER_KEY,
                         position=Vec3(-8.5, 1.55, -0.4),
                         scale=(0.28, 0.07, 0.55))
        self.hide_object()

    def interact(self, gm) -> str:
        if not gm.state.master_key_collected:
            gm.do('pick_up_master_key')
            self.hide_object()
            return "Picked up the Master Key."
        return ""


class ExitDoor(Interactable):
    def __init__(self):
        super().__init__('exit_door', 'EXIT  [LOCKED]',
                         C_DOOR_LOCK,
                         position=Vec3(0, 1.5, 10.08),
                         scale=(2.8, 3.0, 0.18))

    def interact(self, gm) -> str:
        if gm.state.exit_locked:
            if 'master_key' in gm.state.inventory:
                gm.do('unlock_exit')
                self.set_label('EXIT  [OPEN]  — Press E to escape!')
                self.set_base_color(C_DOOR_OPEN)
                return "Exit unlocked!  Press E again to escape!"
            return "Locked — you need the master key."
        else:
            gm.trigger_win()
            return "YOU ESCAPED!"


# ── Factory ───────────────────────────────────────────────────────────────────
def create_all_objects():
    """Returns a dict of obj_id -> Interactable for the game manager."""
    objs = [SmallKey(), Drawer(), CabinetKey(),
            Cabinet(), CodePaper(), Safe(), MasterKey(), ExitDoor()]
    return {o.obj_id: o for o in objs}
