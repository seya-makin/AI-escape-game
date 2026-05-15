"""
Escape Room AI  —  main entry point
====================================
Controls
--------
  WASD / Mouse  — move & look (Human mode)
  E             — interact with highlighted object
  Tab           — switch Human ↔ AI mode
  1/2/3/4       — select algorithm  BFS / DFS / UCS / A*
  R             — reset
  Escape        — quit
"""

from ursina import (Ursina, Entity, Text, Vec3, color, window,
                    raycast, held_keys, invoke, camera, mouse,
                    application, scene, destroy)
from ursina.prefabs.first_person_controller import FirstPersonController
from ursina.lights import DirectionalLight, AmbientLight
from ursina.shaders import basic_lighting_shader

from dataclasses import replace

from ai.state      import GameState
from ai.algorithms import ALGORITHMS
from game.room     import build_room
from game.objects  import create_all_objects
from game.agent    import AIAgent

# ── App setup ─────────────────────────────────────────────────────────────────
app = Ursina(title='Escape Room AI', vsync=True, development_mode=False)
window.color         = color.rgb(15, 12, 20)
window.fps_counter.enabled = True
window.exit_button.visible = False

# Use the lit shader so directional lights produce 3-D shading on geometry.
# Text entities ignore this because they hard-code text_shader themselves.
Entity.default_shader = basic_lighting_shader

ALGO_NAMES  = ['BFS', 'DFS', 'UCS', 'A*']
_algo_idx   = 3   # default A*


# ═══════════════════════════════════════════════════════════════════════════════
#  GameManager — owns all state and wires objects ↔ algorithms ↔ UI
# ═══════════════════════════════════════════════════════════════════════════════
class GameManager:

    INTERACT_RANGE = 3.5

    def __init__(self):
        self.state      = GameState.initial()
        self.mode       = 'human'    # 'human' | 'ai'
        self.complete   = False
        self.ai_agent   = None
        self._prompt_obj = None      # currently highlighted interactable

        # ── lighting ───────────────────────────────────────────────────────────
        AmbientLight(color=color.rgba(80, 80, 80, 0))
        sun = DirectionalLight(shadows=False)
        sun.look_at(Vec3(1, -2, 1))

        # ── build world ────────────────────────────────────────────────────────
        build_room()
        self.objects = create_all_objects()

        # cross-wire objects that reveal other objects
        o = self.objects
        o['drawer'   ]._gm = self
        o['cabinet'  ]._gm = self
        o['safe'     ]._gm = self
        o['exit_door']._gm = self

        # give manager refs so objects can show hidden items
        self.cabinet_key = o['cabinet_key']
        self.code_paper  = o['code_paper']
        self.master_key  = o['master_key']

        # ── player (FPS) ───────────────────────────────────────────────────────
        self.player = FirstPersonController(
            position=Vec3(0, 0, -8),
            speed=6,
        )
        mouse.locked = True
        # Replace FPC's pink diamond with a clean white dot crosshair
        self.player.cursor.color      = color.white
        self.player.cursor.scale      = 0.006
        self.player.cursor.rotation_z = 0

        # ── UI ─────────────────────────────────────────────────────────────────
        self._build_hud()

    # ── symbolic action dispatch ───────────────────────────────────────────────
    def do(self, action_name: str):
        """Apply a named action to the symbolic state."""
        from ai.actions import get_all_actions
        for a in get_all_actions():
            if a.name == action_name and a.is_applicable(self.state):
                self.state = a.apply(self.state)
                self.refresh_hud()
                return True
        return False

    # ── sync 3-D objects to symbolic state (used by AI agent) ─────────────────
    def sync_objects_to_state(self):
        s = self.state
        o = self.objects

        # small key
        if s.small_key_collected and o['small_key'].visible:
            o['small_key'].hide_object()

        # drawer
        if not s.drawer_locked:
            o['drawer'].set_label('Desk Drawer  [OPEN]')
            o['drawer'].set_base_color(color.rgb(160, 110, 55))
            if not s.cabinet_key_collected:
                o['cabinet_key'].show_object()

        # cabinet key
        if s.cabinet_key_collected and o['cabinet_key'].visible:
            o['cabinet_key'].hide_object()

        # cabinet
        if not s.cabinet_locked:
            o['cabinet'].set_label('Cabinet  [OPEN]')
            o['cabinet'].set_base_color(color.rgb(140, 95, 45))
            if not s.code_known:
                o['code_paper'].show_object()

        # code paper — keep visible if read so player can re-check
        # safe
        if not s.safe_locked:
            o['safe'].set_label('Safe  [OPEN]')
            o['safe'].set_base_color(color.rgb(100, 100, 100))
            if not s.master_key_collected:
                o['master_key'].show_object()

        # master key
        if s.master_key_collected and o['master_key'].visible:
            o['master_key'].hide_object()

        # exit door
        if not s.exit_locked:
            o['exit_door'].set_label('EXIT  [OPEN]  — Press E to escape!')
            o['exit_door'].set_base_color(color.rgb(50, 200, 80))

    # ── win ────────────────────────────────────────────────────────────────────
    def trigger_win(self):
        if not self.complete:
            self.complete = True
            self._win_text.visible = True
            if self.mode == 'human':
                mouse.locked = False

    def on_agent_finished(self):
        self.trigger_win()
        self.set_action_label('DONE — Escaped!')

    # ── mode switch ────────────────────────────────────────────────────────────
    def switch_mode(self):
        if self.mode == 'human':
            self._start_ai_mode()
        else:
            self._reset()

    def _start_ai_mode(self):
        global _algo_idx
        algo_name = ALGO_NAMES[_algo_idx]
        algo_fn   = ALGORITHMS[algo_name]

        self.mode = 'ai'
        self.player.enabled = False
        mouse.locked = False

        # Run search
        plan, stats = algo_fn(GameState.initial())

        self._show_metrics(stats)

        if plan is None:
            self.set_action_label('No solution found!')
            return

        # Reset state before animating
        self.state = GameState.initial()
        self.sync_objects_to_state()
        self._reset_object_visuals()

        self.ai_agent = AIAgent(plan, self)

    def _reset_object_visuals(self):
        """Restore all objects to their initial visual state."""
        o = self.objects
        # small key
        o['small_key'].show_object()
        o['small_key'].set_base_color(color.rgb(255, 215, 0))
        # drawer
        o['drawer'].set_label('Desk Drawer  [LOCKED]')
        o['drawer'].set_base_color(color.rgb(110, 70, 30))
        # cabinet key — hidden until drawer opens
        o['cabinet_key'].hide_object()
        # cabinet
        o['cabinet'].set_label('Cabinet  [LOCKED]')
        o['cabinet'].set_base_color(color.rgb(80, 50, 20))
        # code paper — hidden
        o['code_paper'].hide_object()
        # safe
        o['safe'].set_label('Safe  [LOCKED]')
        o['safe'].set_base_color(color.rgb(45, 45, 45))
        # master key — hidden
        o['master_key'].hide_object()
        # exit door
        o['exit_door'].set_label('EXIT  [LOCKED]')
        o['exit_door'].set_base_color(color.rgb(200, 50, 50))

    def _reset(self):
        if self.ai_agent:
            self.ai_agent.destroy()
            self.ai_agent = None

        self.state    = GameState.initial()
        self.mode     = 'human'
        self.complete = False

        self._reset_object_visuals()
        self.sync_objects_to_state()

        self.player.position = Vec3(0, 0, -8)
        self.player.enabled  = True
        mouse.locked = True

        self._win_text.visible     = False
        self._metrics_panel.visible = False
        self._action_lbl.text      = ''
        self.refresh_hud()

    # ── raycasting interaction (human mode) ────────────────────────────────────
    def check_interaction(self):
        if self.mode != 'human' or self.complete:
            return

        ray = raycast(
            camera.world_position,
            camera.forward,
            distance=self.INTERACT_RANGE,
            ignore=[self.player],
        )

        # unhighlight previous
        if self._prompt_obj and (not ray.hit or ray.entity != self._prompt_obj):
            self._prompt_obj.unhighlight()
            self._prompt_obj = None
            self._prompt_text.text = ''

        if ray.hit and hasattr(ray.entity, 'interactable') and ray.entity.interactable:
            obj = ray.entity
            if self._prompt_obj != obj:
                if self._prompt_obj:
                    self._prompt_obj.unhighlight()
                obj.highlight()
                self._prompt_obj = obj
                self._prompt_text.text = f'[E]  {obj._label_str}'

    def on_interact_key(self):
        if self.mode != 'human':
            return
        if self._prompt_obj:
            msg = self._prompt_obj.interact(self)
            if msg:
                self._set_notification(msg)
            self.refresh_hud()

    # ── HUD ────────────────────────────────────────────────────────────────────
    def _build_hud(self):
        # Crosshair is the FPC cursor (styled in __init__ to a clean white dot)

        # Inventory panel (top-left)
        self._inv_text = Text(
            text='Inventory: empty',
            position=(-0.85, 0.46),
            scale=1.05,
            color=color.yellow,
        )

        # Mode / algorithm (top-right)
        self._mode_text = Text(
            text=self._mode_line(),
            position=(0.45, 0.46),
            scale=1.0,
            color=color.cyan,
        )

        # Interact prompt (bottom-centre)
        self._prompt_text = Text(
            text='',
            origin=(0, 0),
            position=(0, -0.40),
            scale=1.15,
            color=color.white,
        )

        # Notification — well above the prompt so they don't overlap
        self._notif_text = Text(
            text='',
            origin=(0, 0),
            position=(0, -0.26),
            scale=1.05,
            color=color.lime,
        )

        # Current AI action label (top-centre)
        self._action_lbl = Text(
            text='',
            origin=(0, 0),
            position=(0, 0.38),
            scale=1.1,
            color=color.orange,
        )

        # Metrics panel (right side, hidden until AI runs)
        self._metrics_panel = Text(
            text='',
            position=(0.35, 0.28),
            scale=0.9,
            color=color.white,
            visible=False,
        )

        # Win text
        self._win_text = Text(
            text='YOU ESCAPED!',
            origin=(0, 0),
            scale=4,
            color=color.gold,
            visible=False,
        )

        # Controls hint (bottom-left, subtle)
        Text(
            text='Tab=Mode  R=Reset  1-4=Algo  Esc=Quit',
            position=(-0.85, -0.46),
            scale=0.75,
            color=color.gray,
        )

        self.refresh_hud()

    def refresh_hud(self):
        inv = ', '.join(sorted(self.state.inventory)) or 'empty'
        self._inv_text.text  = f'Inventory: {inv}'
        self._mode_text.text = self._mode_line()

    def _mode_line(self):
        algo = ALGO_NAMES[_algo_idx]
        return f'Mode: {self.mode.upper()}   Algo: {algo}'

    def set_action_label(self, text: str):
        self._action_lbl.text = f'Agent: {text}'

    def _set_notification(self, text: str):
        self._notif_text.text = text
        invoke(self._clear_notif, delay=3)

    def _clear_notif(self):
        self._notif_text.text = ''

    def _show_metrics(self, stats: dict):
        lines = [
            f"Algorithm  : {stats['algorithm']}",
            f"Nodes exp. : {stats['nodes_expanded']}",
            f"Plan length: {stats['plan_length']}",
            f"Time       : {stats['time_ms']} ms",
            f"Max frontier: {stats['max_frontier']}",
        ]
        self._metrics_panel.text    = '\n'.join(lines)
        self._metrics_panel.visible = True


# ═══════════════════════════════════════════════════════════════════════════════
#  Bootstrap
# ═══════════════════════════════════════════════════════════════════════════════
gm = GameManager()


# ── Frame update ──────────────────────────────────────────────────────────────
def update():
    gm.check_interaction()


# ── Input handler ─────────────────────────────────────────────────────────────
def input(key):
    global _algo_idx

    if key == 'e':
        gm.on_interact_key()

    elif key == 'tab':
        gm.switch_mode()

    elif key == 'r':
        gm._reset()

    elif key == 'escape':
        application.quit()

    elif key == '1':
        _algo_idx = 0; gm.refresh_hud()
    elif key == '2':
        _algo_idx = 1; gm.refresh_hud()
    elif key == '3':
        _algo_idx = 2; gm.refresh_hud()
    elif key == '4':
        _algo_idx = 3; gm.refresh_hud()


app.run()
