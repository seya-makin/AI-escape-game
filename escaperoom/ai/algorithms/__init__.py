from .bfs import bfs
from .dfs import dfs
from .ucs import ucs
from .astar import astar

ALGORITHMS = {
    'BFS': bfs,
    'DFS': dfs,
    'UCS': ucs,
    'A*':  astar,
}
