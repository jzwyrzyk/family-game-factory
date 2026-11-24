"""Fault injection for the offline admission model; no actual provider requests."""
import concurrent.futures
import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('prototype', pathlib.Path(__file__).with_name('premium-admission-prototype.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Ledger = module.Ledger
FIRST = dict(planning=80_000, artwork=100_000, construction=496_000, review=134_000)
MECHANIC = dict(repair=752_000, review=134_000)
VISUAL = dict(planning=80_000, artwork=100_000, repair=752_000, review=134_000)

class Feasibility(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(pathlib.Path(self.tmp.name) / 'ledger.sqlite')
        self.ledger = Ledger(self.path)

    def tearDown(self):
        self.ledger.close()
        self.tmp.cleanup()

    def test_alternatives_and_separate_authorization(self):
        self.assertEqual(sum(FIRST.values()), 810_000)
        self.assertEqual(sum(MECHANIC.values()), 886_000)
        self.assertEqual(sum(VISUAL.values()), 1_066_000)
        self.assertEqual(sum(FIRST.values())+sum(VISUAL.values()), 1_876_000)
        with self.assertRaisesRegex(ValueError, 'ATTEMPT_CAP'):
            self.ledger.admit('visual','seal','approval',VISUAL)
        self.ledger.admit('first','seal','approval-first',FIRST)
        with self.assertRaises(sqlite3.IntegrityError):
            self.ledger.admit('repair','seal','approval-first',MECHANIC)
        self.ledger.admit('repair','seal','approval-repair',MECHANIC)
        self.assertEqual(self.ledger.exposure(), 1_696_000)

    def test_duplicate_and_stale_admission(self):
        self.assertTrue(self.ledger.admit('first','seal','approval',FIRST))
        self.assertFalse(self.ledger.admit('first','seal','approval',FIRST))
        with self.assertRaisesRegex(ValueError, 'ADMISSION_CONFLICT'):
            self.ledger.admit('first','new-seal','approval',FIRST)
        self.assertEqual(self.ledger.exposure(),810_000)

    def test_atomic_family_race(self):
        self.ledger.close()
        # A fresh ledger has exactly enough allowance for one first pass.
        pathlib.Path(self.path).unlink()
        self.ledger=Ledger(self.path,810_000)
        def admit(index):
            ledger=Ledger(self.path)
            try:
                ledger.admit(str(index),'seal','approval-'+str(index),FIRST)
                return True
            except ValueError:
                return False
            finally:
                ledger.close()
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sum(pool.map(admit,[1,2])),1)
        self.assertEqual(self.ledger.exposure(),810_000)

    def test_crash_after_claim_prevents_duplicate_paid_request(self):
        self.ledger.admit('first','seal','approval',FIRST)
        self.assertTrue(self.ledger.claim('first','construction','seal'))
        self.ledger.close()
        self.ledger=Ledger(self.path)
        self.assertFalse(self.ledger.claim('first','construction','seal'))
        self.assertEqual(self.ledger.exposure(),810_000)
        with self.assertRaisesRegex(ValueError,'JOIN_INCOMPLETE'):
            self.ledger.join('first','seal',['construction','artwork'])

    def test_cancel_preserves_unknown_charge_and_accepts_late_settlement(self):
        self.ledger.admit('first','seal','approval',FIRST)
        self.ledger.claim('first','construction','seal')
        self.ledger.cancel('first')
        self.assertEqual(self.ledger.exposure(),496_000)
        with self.assertRaisesRegex(ValueError,'CANCELLED_OR_STALE'):
            self.ledger.claim('first','artwork','seal')
        self.ledger.settle('first','construction','seal',200_000,'code-hash')
        self.assertEqual(self.ledger.exposure(),200_000)
        with self.assertRaisesRegex(ValueError,'JOIN_INCOMPLETE'):
            self.ledger.join('first','seal',['construction'])

    def test_partial_failure_preserves_completed_art(self):
        self.ledger.admit('first','seal','approval',FIRST)
        for name in ['artwork','construction']:
            self.ledger.claim('first',name,'seal')
        self.ledger.settle('first','artwork','seal',100_000,'approved-art')
        self.ledger.settle('first','construction','seal',30_000,None,False)
        self.assertEqual(self.ledger.join('first','seal',['artwork']),module.digest(['seal',[('artwork','approved-art')]]))
        with self.assertRaisesRegex(ValueError,'JOIN_INCOMPLETE'):
            self.ledger.join('first','seal',['artwork','construction'])
        self.assertFalse(self.ledger.claim('first','construction','seal'))

    def test_order_independent_join_and_receipt_idempotency(self):
        results=[]
        for index,order in enumerate([['artwork','construction'],['construction','artwork']]):
            attempt=str(index)
            self.ledger.admit(attempt,'seal','approval-'+attempt,FIRST)
            for name in order:
                self.ledger.claim(attempt,name,'seal')
                self.assertTrue(self.ledger.settle(attempt,name,'seal',20_000,name+'-hash'))
                self.assertFalse(self.ledger.settle(attempt,name,'seal',20_000,name+'-hash'))
                with self.assertRaisesRegex(ValueError,'RECEIPT_CONFLICT'):
                    self.ledger.settle(attempt,name,'seal',21_000,name+'-hash')
            results.append(self.ledger.join(attempt,'seal',order))
        self.assertEqual(results[0],results[1])

    def test_stale_unclaimed_and_over_reservation_receipts(self):
        self.ledger.admit('first','seal','approval',FIRST)
        for cost,contract in [(500_000,'seal'),(10,'stale')]:
            with self.assertRaisesRegex(ValueError,'RECEIPT_INVALID'):
                self.ledger.settle('first','construction',contract,cost,'code')
        with self.assertRaisesRegex(ValueError,'UNCLAIMED_RECEIPT'):
            self.ledger.settle('first','construction','seal',10,'code')
        with self.assertRaisesRegex(ValueError,'CANCELLED_OR_STALE'):
            self.ledger.claim('first','construction','stale')
        self.assertEqual(self.ledger.exposure(),810_000)

if __name__=='__main__':
    import sqlite3
    unittest.main(verbosity=2)
