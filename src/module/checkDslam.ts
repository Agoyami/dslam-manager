// checkDslam.ts - Version intégrée avec base de données

import { spawn } from 'child_process';
import { DslamDBManager } from './DslamManager';
import { IPv4TestResult, ConnectivityStats, DslamInfo, ConnectivityResult, ConnectivityStatsDB, ConnectivityReport } from '../types/interface'

class ConnectivityManager {
    private dbManager: DslamDBManager;
    private connectivityCollection: any; // Collection pour stocker l'historique des tests

    constructor(dbManager: DslamDBManager) {
        this.dbManager = dbManager;
    }

    async initializeConnectivityCollection(): Promise<void> {
        try {
            const db = (this.dbManager as any).db;
            
            // Créer les index pour la collection de connectivité
            await this.connectivityCollection.createIndex({ dslam: 1 });
            await this.connectivityCollection.createIndex({ nra: 1 });
            await this.connectivityCollection.createIndex({ departement: 1 });
            await this.connectivityCollection.createIndex({ region: 1 });
            await this.connectivityCollection.createIndex({ lastTestedAt: 1 });
            await this.connectivityCollection.createIndex({ isReachable: 1 });
            await this.connectivityCollection.createIndex({ networkQuality: 1 });
            
            console.log("Collection de connectivité initialisée avec succès");
        } catch (error) {
            console.error("Erreur initialisation collection connectivité:", error);
        }
    }

    private calculateConnectivityScore(result: {
        ipv4PingReachable: boolean;
        ipv4UdpReachable: boolean;
        ipv6Reachable: boolean;
        responseTime?: number;
    }): number {
        let score = 0;
        
        // Points pour IPv4 ping (30 points max)
        if (result.ipv4PingReachable) score += 30;
        
        // Points pour UDP/SNMP (40 points max - service critique)
        if (result.ipv4UdpReachable) score += 40;
        
        // Points pour IPv6 (30 points max)
        if (result.ipv6Reachable) score += 30;
        
        // Bonus/malus basé sur le temps de réponse
        if (result.responseTime !== undefined) {
            if (result.responseTime < 50) score += 5;      // Excellent
            else if (result.responseTime < 100) score += 2; // Bon
            else if (result.responseTime > 1000) score -= 5; // Très lent
        }
        
        return Math.min(100, Math.max(0, score));
    }

    private determineNetworkQuality(score: number, isReachable: boolean): 'excellent' | 'good' | 'poor' | 'unavailable' {
        if (!isReachable) return 'unavailable';
        if (score >= 80) return 'excellent';
        if (score >= 60) return 'good';
        return 'poor';
    }

    async testUDPPort161(ip: string): Promise<{ success: boolean; responseTime?: number }> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            try {
                if (!ip || ['Non trouvé', 'Erreur', 'N/A'].includes(ip)) {
                    resolve({ success: false });
                    return;
                }

                const ncProcess = spawn('nc', ['-u', '-z', '-w2', ip, '161'], { stdio: 'pipe' });
                const timeout = setTimeout(() => {
                    try {
                        ncProcess.kill('SIGKILL');
                    } catch (e) {
                        // Ignore kill errors
                    }
                    resolve({ success: false });
                }, 3000);

                ncProcess.on('close', (code: number) => {
                    clearTimeout(timeout);
                    const responseTime = Date.now() - startTime;
                    console.log(`UDP test to ${ip} port 161 completed with code ${code} in ${responseTime}ms`);
                    resolve({ 
                        success: code === 0, 
                        responseTime: code === 0 ? responseTime : undefined 
                    });
                });

                ncProcess.on('error', (error: any) => {
                    clearTimeout(timeout);
                    console.error(`UDP test error for ${ip}:`, error.message);
                    resolve({ success: false });
                });
            } catch (error: any) {
                console.error(`UDP test exception for ${ip}:`, error);
                resolve({ success: false });
            }
        });
    }

    async pingIP(ip: string, isIPv6 = false): Promise<{ success: boolean; responseTime?: number }> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            try {
                if (!ip || ['Non trouvé', 'Erreur', 'N/A'].includes(ip)) {
                    resolve({ success: false });
                    return;
                }

                const args = isIPv6 
                    ? ['-6', '-c', '1', '-W', '2', '-n', ip]
                    : ['-c', '1', '-W', '2', '-n', ip];
                
                const pingProcess = spawn('ping', args, { stdio: 'pipe' });
                const timeout = setTimeout(() => {
                    try {
                        pingProcess.kill('SIGKILL');
                    } catch (e) {
                        // Ignore kill errors
                    }
                    resolve({ success: false });
                }, 3000);
                
                let output = '';
                
                pingProcess.stdout?.on('data', (data: Buffer) => {
                    try {
                        output += data.toString();
                    } catch (e) {
                        // Ignore data conversion errors
                    }
                });

                pingProcess.on('close', (code: number) => {
                    clearTimeout(timeout);
                    try {
                        const success = code === 0 && (output.includes('1 reçus') || output.includes('octets de') || output.includes('temps='));
                        const responseTime = success ? Date.now() - startTime : undefined;
                        console.log(`Ping to ${ip} completed with code ${code} in ${responseTime}ms`);
                        resolve({ success, responseTime });
                    } catch (e) {
                        resolve({ success: false });
                    }
                });
                
                pingProcess.on('error', (error: any) => {
                    clearTimeout(timeout);
                    console.error(`Ping error for ${ip}:`, error.message);
                    resolve({ success: false });
                });
            } catch (error: any) {
                console.error(`Ping exception for ${ip}:`, error);
                resolve({ success: false });
            }
        });
    }

    async testIPv4Complete(ip: string): Promise<IPv4TestResult> {
        try {
            if (!ip || ip === 'N/A') {
                return { ping: false, udp161: false, reachable: false };
            }

            const [pingResult, udpResult] = await Promise.allSettled([
                this.pingIP(ip, false),
                this.testUDPPort161(ip)
            ]);

            const pingSuccess = pingResult.status === 'fulfilled' ? pingResult.value.success : false;
            const udpSuccess = udpResult.status === 'fulfilled' ? udpResult.value.success : false;
            
            const pingTime = pingResult.status === 'fulfilled' ? pingResult.value.responseTime : undefined;
            const udpTime = udpResult.status === 'fulfilled' ? udpResult.value.responseTime : undefined;

            return {
                ping: pingSuccess,
                udp161: udpSuccess,
                reachable: pingSuccess || udpSuccess,
                responseTime: pingTime || udpTime
            };
        } catch (error: any) {
            console.error(`IPv4 test error for ${ip}:`, error);
            return { ping: false, udp161: false, reachable: false };
        }
    }

    async testDslamConnectivity(dslam: DslamInfo): Promise<ConnectivityResult> {
        const promises: Array<Promise<{ type: string; result: any }>> = [];
        const testStartTime = Date.now();

        if (dslam.ipv4 && dslam.ipv4 !== 'N/A') {
            promises.push(
                this.testIPv4Complete(dslam.ipv4).then(result => ({ type: 'ipv4', result }))
            );
        }
        
        if (dslam.ipv6 && !['Non trouvé', 'Erreur', 'N/A'].includes(dslam.ipv6)) {
            promises.push(
                this.pingIP(dslam.ipv6, true).then(result => ({ type: 'ipv6', result }))
            );
        }
        
        const results = await Promise.all(promises);
        
        const finalResult: ConnectivityResult = {
            ...dslam,
            ipv4Reachable: false,
            ipv4PingReachable: false,
            ipv4UdpReachable: false,
            ipv6Reachable: false,
            isReachable: false,
            lastTestedAt: new Date(),
            connectivityScore: 0,
            networkQuality: 'unavailable'
        };
        
        let bestResponseTime: number | undefined;
        
        results.forEach(({ type, result }) => {
            if (type === 'ipv4') {
                finalResult.ipv4PingReachable = result.ping;
                finalResult.ipv4UdpReachable = result.udp161;
                finalResult.ipv4Reachable = result.reachable;
                if (result.responseTime && (!bestResponseTime || result.responseTime < bestResponseTime)) {
                    bestResponseTime = result.responseTime;
                }
            } else if (type === 'ipv6') {
                finalResult.ipv6Reachable = result.success;
                if (result.responseTime && (!bestResponseTime || result.responseTime < bestResponseTime)) {
                    bestResponseTime = result.responseTime;
                }
            }
        });
        
        finalResult.isReachable = finalResult.ipv4Reachable || finalResult.ipv6Reachable;
        finalResult.responseTime = bestResponseTime;
        finalResult.connectivityScore = this.calculateConnectivityScore(finalResult);
        finalResult.networkQuality = this.determineNetworkQuality(finalResult.connectivityScore, finalResult.isReachable);
        
        return finalResult;
    }

    // Sauvegarder les résultats de connectivité dans la DB
    async saveConnectivityResults(results: ConnectivityResult[]): Promise<void> {
        try {
            for (const result of results) {
                const connectivityData: ConnectivityStatsDB = {
                    dslam: result.dslam,
                    nra: result.nra,
                    ville: result.ville,
                    departement: result.departement || '',
                    region: result.departement ? 
                        (this.dbManager as any).constructor.DEPARTEMENT_REGION_MAP[result.departement] || 'Région inconnue' : 
                        'Région inconnue',
                    ipv4: result.ipv4 || undefined,
                    ipv6: result.ipv6 || undefined,
                    ipv4Reachable: result.ipv4Reachable,
                    ipv4PingReachable: result.ipv4PingReachable,
                    ipv4UdpReachable: result.ipv4UdpReachable,
                    ipv6Reachable: result.ipv6Reachable,
                    isReachable: result.isReachable,
                    responseTime: result.responseTime,
                    connectivityScore: result.connectivityScore,
                    networkQuality: result.networkQuality,
                    lastTestedAt: result.lastTestedAt,
                    dateCreation: new Date(),
                    dateModification: new Date()
                };

                // Upsert dans la collection de connectivité
                await this.connectivityCollection.updateOne(
                    { dslam: result.dslam, nra: result.nra },
                    { $set: connectivityData },
                    { upsert: true }
                );

                // Mettre à jour le statut fonctionnel dans la collection principale DSLAM
await this.dbManager.updateNraFunctionalStatus();            }

            // Mettre à jour les NRA basé sur leurs DSLAM
            await this.updateNraFunctionalStatus();
            
        } catch (error) {
            console.error('Erreur sauvegarde résultats connectivité:', error);
        }
    }

    // Mettre à jour le statut fonctionnel des NRA basé sur leurs DSLAM
    private async updateNraFunctionalStatus(): Promise<void> {
        try {
            const nraStats = await this.connectivityCollection.aggregate([
                {
                    $group: {
                        _id: '$nra',
                        totalDslam: { $sum: 1 },
                        reachableDslam: { $sum: { $cond: ['$isReachable', 1, 0] } }
                    }
                },
                {
                    $project: {
                        nra: '$_id',
                        isFunctional: { $gt: ['$reachableDslam', 0] }, // Au moins 1 DSLAM joignable
                        reachabilityRate: { $divide: ['$reachableDslam', '$totalDslam'] }
                    }
                }
            ]).toArray();

            for (const stat of nraStats) {
await this.dbManager.updateNraFunctionalStatus();            }
        } catch (error) {
            console.error('Erreur mise à jour statut NRA:', error);
        }
    }

    // Obtenir les statistiques de connectivité depuis la DB
    async getConnectivityStatsFromDB(): Promise<{
        overall: ConnectivityStats;
        byRegion: { [region: string]: ConnectivityStats };
        byDepartement: { [departement: string]: ConnectivityStats };
        byQuality: { [quality: string]: number };
    }> {
        try {
            // Stats globales
            const overallStats = await this.connectivityCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        reachable: { $sum: { $cond: ['$isReachable', 1, 0] } },
                        ipv4Only: { 
                            $sum: { 
                                $cond: [
                                    { $and: ['$ipv4Reachable', { $not: '$ipv6Reachable' }] }, 
                                    1, 0
                                ] 
                            } 
                        },
                        ipv6Only: { 
                            $sum: { 
                                $cond: [
                                    { $and: [{ $not: '$ipv4Reachable' }, '$ipv6Reachable'] }, 
                                    1, 0
                                ] 
                            } 
                        },
                        both: { 
                            $sum: { 
                                $cond: [
                                    { $and: ['$ipv4Reachable', '$ipv6Reachable'] }, 
                                    1, 0
                                ] 
                            } 
                        },
                        udpReachable: { $sum: { $cond: ['$ipv4UdpReachable', 1, 0] } },
                        averageResponseTime: { $avg: '$responseTime' },
                        excellentQuality: { $sum: { $cond: [{ $eq: ['$networkQuality', 'excellent'] }, 1, 0] } },
                        goodQuality: { $sum: { $cond: [{ $eq: ['$networkQuality', 'good'] }, 1, 0] } },
                        poorQuality: { $sum: { $cond: [{ $eq: ['$networkQuality', 'poor'] }, 1, 0] } }
                    }
                }
            ]).toArray();

            const overall = overallStats[0] || {};
            
            // Stats par région
            const regionStats = await this.connectivityCollection.aggregate([
                {
                    $group: {
                        _id: '$region',
                        total: { $sum: 1 },
                        reachable: { $sum: { $cond: ['$isReachable', 1, 0] } },
                        averageResponseTime: { $avg: '$responseTime' },
                        udpReachable: { $sum: { $cond: ['$ipv4UdpReachable', 1, 0] } }
                    }
                }
            ]).toArray();

            // Stats par département
            const departementStats = await this.connectivityCollection.aggregate([
                {
                    $group: {
                        _id: '$departement',
                        total: { $sum: 1 },
                        reachable: { $sum: { $cond: ['$isReachable', 1, 0] } },
                        averageResponseTime: { $avg: '$responseTime' },
                        udpReachable: { $sum: { $cond: ['$ipv4UdpReachable', 1, 0] } }
                    }
                }
            ]).toArray();

            const byRegion: { [region: string]: ConnectivityStats } = {};
            regionStats.forEach((stat: { _id: string | number; total: number; reachable: number; averageResponseTime: any; udpReachable: any; }) => {
                byRegion[stat._id] = {
                    total: stat.total,
                    reachable: stat.reachable,
                    unreachable: stat.total - stat.reachable,
                    reachabilityRate: Math.round((stat.reachable / stat.total) * 100),
                    averageResponseTime: Math.round(stat.averageResponseTime || 0),
                    udpReachable: stat.udpReachable,
                    // Simplifiés pour les stats régionales
                    ipv4Only: 0,
                    ipv6Only: 0,
                    both: 0,
                    excellentQuality: 0,
                    goodQuality: 0,
                    poorQuality: 0
                };
            });

            const byDepartement: { [departement: string]: ConnectivityStats } = {};
            departementStats.forEach((stat: { _id: string | number; total: number; reachable: number; averageResponseTime: any; udpReachable: any; }) => {
                byDepartement[stat._id] = {
                    total: stat.total,
                    reachable: stat.reachable,
                    unreachable: stat.total - stat.reachable,
                    reachabilityRate: Math.round((stat.reachable / stat.total) * 100),
                    averageResponseTime: Math.round(stat.averageResponseTime || 0),
                    udpReachable: stat.udpReachable,
                    ipv4Only: 0,
                    ipv6Only: 0,
                    both: 0,
                    excellentQuality: 0,
                    goodQuality: 0,
                    poorQuality: 0
                };
            });

            return {
                overall: {
                    total: overall.total || 0,
                    reachable: overall.reachable || 0,
                    unreachable: (overall.total || 0) - (overall.reachable || 0),
                    reachabilityRate: overall.total ? Math.round((overall.reachable / overall.total) * 100) : 0,
                    ipv4Only: overall.ipv4Only || 0,
                    ipv6Only: overall.ipv6Only || 0,
                    both: overall.both || 0,
                    udpReachable: overall.udpReachable || 0,
                    averageResponseTime: Math.round(overall.averageResponseTime || 0),
                    excellentQuality: overall.excellentQuality || 0,
                    goodQuality: overall.goodQuality || 0,
                    poorQuality: overall.poorQuality || 0
                },
                byRegion,
                byDepartement,
                byQuality: {
                    excellent: overall.excellentQuality || 0,
                    good: overall.goodQuality || 0,
                    poor: overall.poorQuality || 0,
                    unavailable: (overall.total || 0) - (overall.reachable || 0)
                }
            };
        } catch (error) {
            console.error('Erreur récupération stats connectivité DB:', error);
            return {
                overall: {} as ConnectivityStats,
                byRegion: {},
                byDepartement: {},
                byQuality: {}
            };
        }
    }

    // Méthode principale pour tester et sauvegarder la connectivité
    async checkAndSaveDslamsConnectivity(
        departement: string = '76', 
        ville: string = 'Rouen', 
        batchSize: number = 6
    ): Promise<ConnectivityReport & { savedToDatabase: boolean }> {
        try {
            console.log(`🔍 Test de connectivité pour ${ville} (${departement})...`);
            
            const res: DslamInfo[] = await this.connectivityCollection.find({ departement: departement, ville: ville }).toArray();
            
            
            if (!res || res.length === 0) {
                return { 
                    all: [], 
                    reachable: [], 
                    unreachable: [], 
                    stats: {} as ConnectivityStats,
                    savedToDatabase: false
                };
            }
            
            const dslamData = res.map(dslam => ({
                ...dslam,
                departement: departement
            }));
            
            const batches = this.chunkArray(dslamData, batchSize);
            const allResults: ConnectivityResult[] = [];
            
            console.log(`⏳ Test de ${dslamData.length} DSLAM en ${batches.length} lots...`);
            
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`   Lot ${i + 1}/${batches.length} (${batch.length} DSLAM)...`);
                
                const batchPromises = batch.map(dslam => this.testDslamConnectivity(dslam));
                const batchResults = await Promise.all(batchPromises);
                
                allResults.push(...batchResults);
                
                // Pause entre les lots
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            const reachable = allResults.filter(r => r.isReachable);
            const unreachable = allResults.filter(r => !r.isReachable);
            
            const stats: ConnectivityStats = {
                total: allResults.length,
                reachable: reachable.length,
                unreachable: unreachable.length,
                reachabilityRate: allResults.length > 0 ? Math.round((reachable.length / allResults.length) * 100) : 0,
                ipv4Only: reachable.filter(r => r.ipv4Reachable && !r.ipv6Reachable).length,
                ipv6Only: reachable.filter(r => !r.ipv4Reachable && r.ipv6Reachable).length,
                both: reachable.filter(r => r.ipv4Reachable && r.ipv6Reachable).length,
                udpReachable: reachable.filter(r => r.ipv4UdpReachable).length,
                averageResponseTime: Math.round(
                    reachable.reduce((acc, r) => acc + (r.responseTime || 0), 0) / Math.max(reachable.length, 1)
                ),
                excellentQuality: reachable.filter(r => r.networkQuality === 'excellent').length,
                goodQuality: reachable.filter(r => r.networkQuality === 'good').length,
                poorQuality: reachable.filter(r => r.networkQuality === 'poor').length
            };
            
            // Sauvegarder en base
            console.log(`💾 Sauvegarde de ${allResults.length} résultats en base...`);
            await this.saveConnectivityResults(allResults);
            
            console.log(`✅ Test terminé - Taux de réussite: ${stats.reachabilityRate}% (${reachable.length}/${allResults.length})`);
            
            return {
                all: allResults,
                reachable,
                unreachable,
                stats,
                savedToDatabase: true
            };
            
        } catch (error) {
            console.error('Erreur test connectivité:', error);
            throw error;
        }
    }

    private chunkArray<T>(array: Array<T>, chunkSize: number): Array<Array<T>> {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    // Méthode pour retester les DSLAM non joignables
    async retestUnreachableDslams(departement?: string): Promise<{
        retested: number;
        newlyReachable: number;
        stillUnreachable: number;
    }> {
        try {
            const query: any = { isReachable: false };
            if (departement) query.departement = departement;
            
            const unreachableDslams = await this.connectivityCollection.find(query).toArray();
            console.log(`🔄 Nouveau test de ${unreachableDslams.length} DSLAM non joignables...`);
            
            let newlyReachable = 0;
            let stillUnreachable = 0;
            
            for (const dslamData of unreachableDslams) {
                const result = await this.testDslamConnectivity(dslamData);
                
                if (result.isReachable && !dslamData.isReachable) {
                    newlyReachable++;
                    console.log(`✅ ${dslamData.dslam} maintenant joignable!`);
                } else {
                    stillUnreachable++;
                }
                
                // Sauvegarder le résultat mis à jour
                await this.saveConnectivityResults([result]);
                
                // Petite pause
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            console.log(`🎯 Retest terminé: ${newlyReachable} nouveaux joignables, ${stillUnreachable} toujours inaccessibles`);
            
            return {
                retested: unreachableDslams.length,
                newlyReachable,
                stillUnreachable
            };
        } catch (error) {
            console.error('Erreur retest DSLAM:', error);
            return { retested: 0, newlyReachable: 0, stillUnreachable: 0 };
        }
    }
}

// Fonction principale intégrée
async function runCompleteConnectivityAnalysis(): Promise<void> {
    const dbManager = new DslamDBManager();
    let connectivityManager: ConnectivityManager;
    
    try {
        await dbManager.connect();
        console.log("🔗 Connexion à la base de données établie");
        
        connectivityManager = new ConnectivityManager(dbManager);
        await connectivityManager.initializeConnectivityCollection();
        
        // Test sur tous les départements ou un département spécifique
        const departementAAnalyser = process.argv[2] || '76'; // Prendre depuis args ou défaut
        
        if (departementAAnalyser === 'all') {
            console.log("🌍 Analyse de connectivité sur tous les départements français...");
            // Logique pour tous les départements
            const departements = [
                ...Array.from({ length: 95 }, (_, i) => (i + 1).toString().padStart(2, '0')),
                '2A', '2B', '971', '972', '973', '974', '976'
            ];
            for (const dept of departements) {
                await connectivityManager.checkAndSaveDslamsConnectivity(dept, 'Toutes', 6);
                // Pause entre départements
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } else {
            console.log(`🌍 Analyse de connectivité pour le département ${departementAAnalyser}...`);
            await connectivityManager.checkAndSaveDslamsConnectivity(departementAAnalyser, 'Toutes', 6);
        }
        // Obtenir et afficher les stats globales
        const stats = await connectivityManager.getConnectivityStatsFromDB();
        console.log("📊 Statistiques globales de connectivité:", stats.overall);
    } catch (error) {
        console.error("Erreur dans l'analyse complète de connectivité:", error);
    } finally {
        await dbManager.disconnect();
        console.log("🔌 Connexion à la base de données fermée");
    }
}