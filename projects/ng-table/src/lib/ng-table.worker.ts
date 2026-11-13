/**
 * Point d'entrée du Web Worker de calcul (voir `worker-compute.ts`). Ce fichier est empaqueté en une seule source
 * (`worker-source.generated.ts`, par `scripts/bundle-worker.mjs`) que la table charge dans un `Blob` : aucun réglage de
 * l'application n'est nécessaire. Pour un autre mode de chargement (CSP stricte), voir `[computeWorkerFactory]`.
 */
import {FromWorker, ToWorker, WorkerComputeCore} from './worker-compute';

interface WorkerScope {
  onmessage: ((event: {data: ToWorker}) => void) | null;
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const core = new WorkerComputeCore();

scope.onmessage = ({data}) => {
  switch (data.type) {
    case 'data':
      core.addData(data.dataset, data.count, data.entries);
      break;
    case 'drop':
      core.drop(data.dataset);
      break;
    case 'patch':
      // Une retouche qui échoue laisse le jeu de données dans un état inconnu : il est oublié, et le calcul suivant
      // répond par une erreur (le fil principal reprend alors la main).
      try {
        core.patch(data.dataset, data.patch);
      } catch {
        core.drop(data.dataset);
      }
      break;
    case 'pivot':
      try {
        scope.postMessage({type: 'pivot-done', job: data.job, result: core.pivot(data.dataset, data.spec)});
      } catch (error) {
        scope.postMessage({type: 'error', job: data.job, message: error instanceof Error ? error.message : String(error)});
      }
      break;
    case 'run':
      try {
        const order = core.run(data.dataset, data.request);
        scope.postMessage({type: 'done', job: data.job, order}, [order.buffer]);
      } catch (error) {
        scope.postMessage({type: 'error', job: data.job, message: error instanceof Error ? error.message : String(error)});
      }
      break;
  }
};
