"""Execute only the hash-verified external framework, never uploaded source."""
import os
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from generate_metadata import verified_sources

CHECKOUT = Path(os.environ.get('SILICON_SOURCE', '/tmp/actwright-silicon'))
AVAILABLE = CHECKOUT.exists()
if AVAILABLE:
    verified_sources(CHECKOUT)
    sys.path.insert(0, str(CHECKOUT))
    from silicon import Component, Entity, Game, GridMovement, InputMap, Score, Session, Stage2D, State, input, output, trigger, update


@unittest.skipUnless(AVAILABLE, 'Set SILICON_SOURCE to the pinned external checkout')
class SiliconCompatibilityTests(unittest.TestCase):
    def test_tree_link_identity_exact_types_and_numbered_selection(self):
        game = Game()
        game[Stage2D(5, 3)]
        game[Stage2D][Entity('Player'):'player,hero']
        player = game[Stage2D][Entity:'player'].component
        game[Entity:'player'] = game[Stage2D][Entity:'player']
        self.assertIs(game[Entity:'player'].component, player)
        self.assertIs(game[Stage2D][Entity:'hero'].component, player)
        self.assertIsNone(game[Entity:'missing?'])
        game[Stage2D][Entity('Older'):'enemy9']
        game[Stage2D][Entity('Newer'):'enemy2']
        self.assertEqual(game[Stage2D][Entity:'enemy#'].name, 'Newer')
        self.assertEqual(game[Stage2D][Entity:'enemy#-1'].name, 'Older')
        self.assertEqual(len(game[Stage2D][Entity:'player,hero']), 1)
        with self.assertRaises(ValueError):
            game[Stage2D][Entity:'player'][Stage2D:'cycle'] = game[Stage2D]

    def test_real_grid_signal_chain(self):
        game = Game()
        game.add(Stage2D(5, 3), id='stage')
        game.add(InputMap(), id='keys')
        game.add(GridMovement(entity='player'), id='movement')
        game['keys'].out.action >> game['movement'].ins.command
        game.start()
        game['stage'].ins.place('player', 0, 0)
        game['keys'].ins.feed('d')
        self.assertEqual(game['stage'].state.cells['player'], [1, 0])
        game.stop()

    def test_framework_does_not_structurally_check_output_parameter_annotations(self):
        class TextSource(Component):
            @output
            def changed(self, value: str): pass
        class IntSink(Component):
            @input
            def receive(self, value: int): pass
        game = Game()
        game.add(TextSource(), id='source')
        game.add(IntSink(), id='sink')
        game['source'].out.changed >> game['sink'].ins.receive  # Connection succeeds.
        with self.assertRaises(TypeError):
            game['source'].out.changed('text')  # Runtime rejects the actual value.

    def test_snapshot_preserves_slots_and_tree_but_omits_trigger_rules(self):
        game = Game()
        game.add(Score(), id='score')
        game[Entity('Player'):'player']
        events = []
        game.start >> (lambda game: events.append(game.name))
        snapshot = game.snapshot()
        restored = Game()
        restored.restore(snapshot)
        self.assertTrue(restored[Entity:'player'])
        restored.start()
        self.assertEqual(events, [])
        restored.stop()

    def test_session_factory_wires_triggers_before_start_and_restart(self):
        events = []
        def factory():
            game = Game('Workshop')
            game[Entity('Player'):'player']
            game.start >> [game[Entity:'player'].spawn, lambda game: events.append(game)]
            return game
        with Session(factory) as session:
            previous = session.game
            self.assertTrue(previous[Entity:'player'].spawned)
            session.restart()
            self.assertIsNot(session.game, previous)
            self.assertTrue(session.game[Entity:'player'].spawned)
            self.assertEqual(len(events), 2)

    def test_game_and_shared_state_and_insertion_order(self):
        records = []
        class Counter(Component):
            local = State(0, scope='game')
            total = State(0, scope='shared')
            def __component__(self, label): self.label = label
            @input
            def add(self): self.local += 1; self.total += 1
            @update()
            def advance(self, dt): records.append(self.label)
        counter = Counter('first')
        first, second = Game(), Game()
        first.add(counter, id='counter')
        second.add(counter, id='counter')
        first.add(Counter('second'), id='second')
        first[counter].ins.add()
        self.assertEqual(first[counter].state.local, 1)
        self.assertEqual(second[counter].state.local, 0)
        self.assertEqual(second[counter].state.total, 1)
        first.start()
        first.step(0.1)
        self.assertEqual(records, ['first', 'second'])
        first.pause()
        first.step(0.1)
        self.assertEqual(records, ['first', 'second'])
        first.stop()

    def test_flat_ids_differ_from_tree_aliases_and_spawn_does_not_place(self):
        game = Game()
        game[Stage2D(3, 3):'stage']
        stage = game[Stage2D:'stage'].component
        key = next(key for key, component in game.components.items() if component is stage)
        self.assertNotEqual(key, 'stage')
        self.assertIs(game.get(key), stage)
        game[Stage2D:'stage'][Entity('Player'):'player']
        game[Stage2D:'stage'][Entity:'player'].spawn()
        self.assertEqual(game[stage].state.cells, {})
