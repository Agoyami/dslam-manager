import { runHarmonizedDslamProcess, retestFailedDslamOnly } from './module/DslamManager';

// Point d'entrée principal
if (require.main === module) {
    const mode = process.argv[2] || 'complete';
    
    if (mode === 'retest') {
        retestFailedDslamOnly().catch(console.error);
    } else {
        runHarmonizedDslamProcess().catch(console.error);
    }
}