from ursina import Entity, color, Vec3

# ── Palette ──────────────────────────────────────────────────────────────────
C_WALL    = color.rgb(190, 170, 145)
C_FLOOR   = color.rgb(100,  75,  50)
C_CEIL    = color.rgb(230, 225, 215)
C_DESK    = color.rgb(139,  90,  43)
C_CABINET = color.rgb(101,  67,  33)
C_SAFE    = color.rgb( 70,  70,  70)


def build_room() -> list:
    """
    Constructs all static geometry for the escape room.
    Returns a list of created entities (for cleanup if needed).

    Coordinate system:
      x = left(-) / right(+)
      y = down(0) / up(+)
      z = back(-10) .. front(+10)

    Room interior: 20 x 4 x 20  (width, height, depth)
    """
    entities = []

    def make(pos, scale, col, tex=None, coll='box'):
        kw = dict(model='cube', color=col, position=Vec3(*pos),
                  scale=Vec3(*scale), collider=coll)
        if tex:
            kw['texture'] = tex
        e = Entity(**kw)
        entities.append(e)
        return e

    t = 0.5   # wall thickness

    # ── Floor & ceiling ───────────────────────────────────────────────────────
    make((0, -t/2,  0), (20, t, 20), C_FLOOR, 'white_cube')
    make((0, 4+t/2, 0), (20, t, 20), C_CEIL)

    # ── Back wall (z = -10) ───────────────────────────────────────────────────
    make((0, 2, -10-t/2), (20, 4+t, t), C_WALL, 'white_cube')

    # ── Left wall (x = -10) ───────────────────────────────────────────────────
    make((-10-t/2, 2, 0), (t, 4+t, 20), C_WALL, 'white_cube')

    # ── Right wall (x = +10) ─────────────────────────────────────────────────
    make((10+t/2, 2, 0), (t, 4+t, 20), C_WALL, 'white_cube')

    # ── Front wall (z = +10) with door gap (x: -1.5 to +1.5, y: 0 to 3) ─────
    make((-5.75, 2, 10+t/2), (8.5, 4+t, t), C_WALL, 'white_cube')   # left section
    make(( 5.75, 2, 10+t/2), (8.5, 4+t, t), C_WALL, 'white_cube')   # right section
    make((0, 3.5+t/2, 10+t/2), (3, 1+t, t), C_WALL, 'white_cube')   # above door

    # ── Desk (back-centre) ────────────────────────────────────────────────────
    make((0, 0.5, -6), (3.5, 1.0, 1.8), C_DESK, 'white_cube')       # body
    make((0, 1.05, -6), (3.5, 0.1, 1.8), C_DESK)                    # surface

    # ── Cabinet body (right wall) ─────────────────────────────────────────────
    make((8.5, 1.5, 3), (1.5, 3.0, 2.0), C_CABINET, 'white_cube')

    # ── Safe body (left wall) ─────────────────────────────────────────────────
    make((-8.5, 1.5, 0), (1.5, 1.5, 1.5), C_SAFE)

    # ── Decorative details (no collider — don't block player) ─────────────────
    def detail(pos, scale, col):
        e = Entity(model='cube', color=col,
                   position=Vec3(*pos), scale=Vec3(*scale))
        entities.append(e)
        return e

    # Area rug under desk
    detail((0, 0.01, -5.5), (5.0, 0.02, 4.0), color.rgb(110, 35, 35))

    # Desk chair
    detail((2.2, 0.46, -5.2 ), (0.75, 0.08, 0.75), color.rgb(30, 30, 30))  # seat
    detail((2.2, 0.82, -5.57), (0.72, 0.70, 0.08), color.rgb(30, 30, 30))  # backrest
    detail((2.2, 0.23, -5.2 ), (0.08, 0.46, 0.08), color.rgb(20, 20, 20))  # pedestal

    # Ceiling lamp
    detail((0, 3.90, 0), (0.45, 0.08, 0.45), color.rgb(45, 45, 45))        # mount
    detail((0, 3.75, 0), (0.30, 0.22, 0.30), color.rgb(255, 248, 215))     # globe

    # Framed painting on back wall (left side)
    detail((-3.5, 2.4, -9.95), (1.8, 1.4, 0.04), color.rgb(65, 42, 15))   # frame
    detail((-3.5, 2.4, -9.91), (1.4, 1.0, 0.04), color.rgb(85, 125, 165)) # canvas

    # Bookshelf in back-right area
    detail((5.0, 1.5, -9.8), (1.5, 3.0, 0.35), color.rgb(90, 58, 22))     # body
    for i, bc in enumerate([
        color.rgb(180, 40, 40), color.rgb(45, 100, 170),
        color.rgb(160, 130, 40), color.rgb(55, 140, 55),
    ]):
        detail((4.7 + i * 0.22, 2.4, -9.7), (0.18, 0.50, 0.22), bc)       # top shelf
    for i, bc in enumerate([
        color.rgb(140, 50, 140), color.rgb(200, 100, 40),
        color.rgb(50, 50, 155), color.rgb(155, 40, 40),
    ]):
        detail((4.7 + i * 0.22, 1.55, -9.7), (0.18, 0.45, 0.22), bc)      # bottom shelf

    # Doormat in front of exit door
    detail((0, 0.01, 9.0), (2.5, 0.02, 1.5), color.rgb(45, 65, 125))

    return entities
