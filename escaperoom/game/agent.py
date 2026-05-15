"""
AI Agent visual controller.

Creates an orange capsule-shaped entity that walks through the room
following the plan produced by a search algorithm.  The camera tracks
it from a third-person perspective.
"""

from ursina import Entity, Vec3, color, invoke, camera, Text


# Where the agent stands in each area
AREA_POSITIONS = {
    'start_area':   Vec3( 0.0, 0.0, -7.5),
    'desk_area':    Vec3( 0.5, 0.0, -4.5),
    'cabinet_area': Vec3( 7.0, 0.0,  3.0),
    'safe_area':    Vec3(-7.0, 0.0,  0.0),
    'exit_area':    Vec3( 0.0, 0.0,  8.5),
}

STEP_DELAY = 1.6   # seconds between plan steps
CAM_OFFSET = Vec3(0, 6, -10)


class AIAgent:
    """Animates a plan step-by-step in the Ursina scene."""

    def __init__(self, plan, game_manager):
        self.plan         = plan
        self.gm           = game_manager
        self.step_idx     = 0
        self.done         = False

        # Visual body — tall orange box (Ursina has no capsule primitive)
        self.body = Entity(
            model='cube',
            color=color.orange,
            scale=Vec3(0.5, 1.7, 0.5),
            position=AREA_POSITIONS['start_area'] + Vec3(0, 0.85, 0),
        )
        # Floating "AI" label
        self._lbl = Text(
            text='AI Agent',
            parent=self.body,
            position=(0, 1.3, 0),
            scale=14,
            color=color.yellow,
            billboard=True,
        )

        self._move_camera_to('start_area')
        invoke(self._execute_next, delay=1.0)

    # ── main loop ─────────────────────────────────────────────────────────────
    def _execute_next(self):
        if self.step_idx >= len(self.plan):
            self.done = True
            self.gm.on_agent_finished()
            return

        action = self.plan[self.step_idx]
        self.step_idx += 1

        # Update symbolic state
        self.gm.state = action.apply(self.gm.state)
        self.gm.refresh_hud()

        # Move body if it's a move action
        if action.name.startswith('move_to_'):
            dest = action.name[len('move_to_'):]
            target_pos = AREA_POSITIONS.get(dest, self.body.position)
            self.body.animate_position(
                target_pos + Vec3(0, 0.85, 0),
                duration=STEP_DELAY * 0.7,
                curve=None,
            )
            self._move_camera_to(dest)

        # Update action label on HUD
        self.gm.set_action_label(action.name)

        # Sync visible object states with new symbolic state
        self.gm.sync_objects_to_state()

        invoke(self._execute_next, delay=STEP_DELAY)

    # ── camera follow ──────────────────────────────────────────────────────────
    def _move_camera_to(self, area: str):
        pos = AREA_POSITIONS.get(area, Vec3(0, 0, 0))
        camera.animate_position(pos + CAM_OFFSET, duration=STEP_DELAY * 0.6)
        camera.look_at(pos + Vec3(0, 1, 0))

    def destroy(self):
        if self.body:
            from ursina import destroy as ursina_destroy
            ursina_destroy(self.body)
