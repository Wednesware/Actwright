import * as React from 'react';
import { Box, Settings2, Check, ArrowRight, LoaderCircle } from 'lucide-react';
import { workspace, type WorkspaceState } from '../app/workspace.ts';

export function TutorialCard({ state, onAddStage, onInspect }: { state: WorkspaceState; onAddStage: () => void; onInspect: () => void }) {
  const [finishing, setFinishing] = React.useState(false);
  if (state.tutorial.status !== 'active' || !state.project) return null;
  const stage = state.project.game.order.find(id => state.project!.instances[id]?.typeId === 'silicon.Stage2D');
  const step = stage ? state.tutorial.step : 0;
  const skip = () => { void workspace.setTutorial({ version: 1, status: 'skipped', step: state.tutorial.step }); };
  const advance = (step: 1 | 2) => { void workspace.setTutorial({ version: 1, status: 'active', step }); };
  return <section className={`canvas-empty tutorial-card ${(state.project.game.order.length || Object.keys(state.project.scripts).length) ? 'tutorial-guide' : ''}`} aria-label="Workspace tutorial" data-testid="tutorial-card">
    <span className="tutorial-progress">WORKSPACE TUTORIAL · {step + 1} / 3</span>
    {step === 0 ? <><Box size={32}/><h2>A little structure. Endless possibilities.</h2><p>Add a Stage2D component to give your game a board.</p><button className="button primary" onClick={onAddStage}>Add a Stage2D</button>
      {stage && <button className="text-button tutorial-continue" onClick={() => advance(1)}>Continue with the existing stage <ArrowRight size={13}/></button>}
    </> : step === 1 ? <><Settings2 size={28}/><h2>Make the stage yours.</h2><p>The inspector lets you edit its name, width and height. The Act tree shows where it belongs.</p><button className="button primary" onClick={() => { workspace.select(stage!); onInspect(); advance(2); }}>Inspect your stage <ArrowRight size={14}/></button></>
      : <><Check size={28}/><h2>Your work stays with you.</h2><p>Edits save automatically in this browser. Use <strong>Save .act</strong> to keep a portable backup. You can reopen this tutorial with the question mark above.</p><button className="button primary" disabled={finishing} onClick={() => {
        setFinishing(true);
        void workspace.finishTutorial().catch(error => workspace.log(`Could not finish tutorial: ${String(error)}`, 'error')).finally(() => setFinishing(false));
      }}>{finishing ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>}Finish tutorial</button></>}
    <button className="text-button tutorial-skip" onClick={skip}>Skip tutorial</button>
  </section>;
}
