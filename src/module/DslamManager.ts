import { MongoClient, Db, Collection } from 'mongodb';
const { spawn } = require('child_process');
import { DslamInfoDB, NraInfo, ConnectivityTestResult, GlobalProcessingResult, ProcessingPhaseResult, DslamInfo} from '../types/interface'
import dotenv from 'dotenv';
dotenv.config()

class DslamDBManager {
    private client: MongoClient;
    private db: Db;
    public dslamCollection: Collection<DslamInfoDB>;
    public nraCollection: Collection<NraInfo>;
    public connectivityCollection: Collection<ConnectivityTestResult>;
    private connectivityHistoryCollection: Collection<ConnectivityTestResult>;

    // Mapping des départements vers les régions (identique)
    private static readonly DEPARTEMENT_REGION_MAP: Record<string, string> = {
        // Auvergne-Rhône-Alpes
        '01': 'Auvergne-Rhône-Alpes', '03': 'Auvergne-Rhône-Alpes', '07': 'Auvergne-Rhône-Alpes',
        '15': 'Auvergne-Rhône-Alpes', '26': 'Auvergne-Rhône-Alpes', '38': 'Auvergne-Rhône-Alpes',
        '42': 'Auvergne-Rhône-Alpes', '43': 'Auvergne-Rhône-Alpes', '63': 'Auvergne-Rhône-Alpes',
        '69': 'Auvergne-Rhône-Alpes', '73': 'Auvergne-Rhône-Alpes', '74': 'Auvergne-Rhône-Alpes',
        
        // Bourgogne-Franche-Comté
        '21': 'Bourgogne-Franche-Comté', '25': 'Bourgogne-Franche-Comté', '39': 'Bourgogne-Franche-Comté',
        '58': 'Bourgogne-Franche-Comté', '70': 'Bourgogne-Franche-Comté', '71': 'Bourgogne-Franche-Comté',
        '89': 'Bourgogne-Franche-Comté', '90': 'Bourgogne-Franche-Comté',
        
        // Bretagne
        '22': 'Bretagne', '29': 'Bretagne', '35': 'Bretagne', '56': 'Bretagne',
        
        // Centre-Val de Loire
        '18': 'Centre-Val de Loire', '28': 'Centre-Val de Loire', '36': 'Centre-Val de Loire',
        '37': 'Centre-Val de Loire', '41': 'Centre-Val de Loire', '45': 'Centre-Val de Loire',
        
        // Corse
        '2A': 'Corse', '2B': 'Corse',
        
        // Grand Est
        '08': 'Grand Est', '10': 'Grand Est', '51': 'Grand Est', '52': 'Grand Est',
        '54': 'Grand Est', '55': 'Grand Est', '57': 'Grand Est', '67': 'Grand Est',
        '68': 'Grand Est', '88': 'Grand Est',
        
        // Hauts-de-France
        '02': 'Hauts-de-France', '59': 'Hauts-de-France', '60': 'Hauts-de-France',
        '62': 'Hauts-de-France', '80': 'Hauts-de-France',
        
        // Île-de-France
        '75': 'Île-de-France', '77': 'Île-de-France', '78': 'Île-de-France',
        '91': 'Île-de-France', '92': 'Île-de-France', '93': 'Île-de-France',
        '94': 'Île-de-France', '95': 'Île-de-France',
        
        // Normandie
        '14': 'Normandie', '27': 'Normandie', '50': 'Normandie', '61': 'Normandie', '76': 'Normandie',
        
        // Nouvelle-Aquitaine
        '16': 'Nouvelle-Aquitaine', '17': 'Nouvelle-Aquitaine', '19': 'Nouvelle-Aquitaine',
        '23': 'Nouvelle-Aquitaine', '24': 'Nouvelle-Aquitaine', '33': 'Nouvelle-Aquitaine',
        '40': 'Nouvelle-Aquitaine', '47': 'Nouvelle-Aquitaine', '64': 'Nouvelle-Aquitaine',
        '79': 'Nouvelle-Aquitaine', '86': 'Nouvelle-Aquitaine', '87': 'Nouvelle-Aquitaine',
        
        // Occitanie
        '09': 'Occitanie', '11': 'Occitanie', '12': 'Occitanie', '30': 'Occitanie',
        '31': 'Occitanie', '32': 'Occitanie', '34': 'Occitanie', '46': 'Occitanie',
        '48': 'Occitanie', '65': 'Occitanie', '66': 'Occitanie', '81': 'Occitanie', '82': 'Occitanie',
        
        // Pays de la Loire
        '44': 'Pays de la Loire', '49': 'Pays de la Loire', '53': 'Pays de la Loire',
        '72': 'Pays de la Loire', '85': 'Pays de la Loire',
        
        // Provence-Alpes-Côte d'Azur
        '04': 'Provence-Alpes-Côte d\'Azur', '05': 'Provence-Alpes-Côte d\'Azur',
        '06': 'Provence-Alpes-Côte d\'Azur', '13': 'Provence-Alpes-Côte d\'Azur',
        '83': 'Provence-Alpes-Côte d\'Azur', '84': 'Provence-Alpes-Côte d\'Azur',
        
        // Outre-mer
        '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane',
        '974': 'La Réunion', '975': 'Saint-Pierre-et-Miquelon', '976': 'Mayotte'
    };

    constructor(connectionString: string = process.env.MONGO_URI, dbName: string = 'DSLAM') {
        this.client = new MongoClient(connectionString);
        this.db = this.client.db(dbName);
        this.dslamCollection = this.db.collection<DslamInfoDB>('dslams');
        this.nraCollection = this.db.collection<NraInfo>('nras');
        this.connectivityHistoryCollection = this.db.collection<ConnectivityTestResult>('connectivity_history');
        this.connectivityCollection = this.db.collection('connectivity_history');

    }

    async connect(): Promise<void> {
        try {
            await this.client.connect();
            console.log("📡 Connexion à la base de données établie");
            await this.createIndexes();
        } catch (error) {
            console.error("❌ Échec de la connexion à la base de données:", error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        await this.client.close();
        console.log("🔌 Déconnexion de la base de données");
    }

    private async createIndexes(): Promise<void> {
        try {
            // Index DSLAM
            await this.dslamCollection.createIndex({ nra: 1 });
            await this.dslamCollection.createIndex({ ville: 1 });
            await this.dslamCollection.createIndex({ dslam: 1 }, { unique: true, name: "unique_dslam_index" });
            await this.dslamCollection.createIndex({ departement: 1 });
            await this.dslamCollection.createIndex({ region: 1 });
            await this.dslamCollection.createIndex({ fonctionnel: 1 });
            await this.dslamCollection.createIndex({ dernierTestConnectivite: 1 });

            // Index NRA
            await this.nraCollection.createIndex({ nra: 1 }, { unique: true });
            await this.nraCollection.createIndex({ departement: 1 });
            await this.nraCollection.createIndex({ region: 1 });
            await this.nraCollection.createIndex({ fonctionnel: 1 });

            // Index historique connectivité
            await this.connectivityHistoryCollection.createIndex({ dslam: 1 });
            await this.connectivityHistoryCollection.createIndex({ nra: 1 });
            await this.connectivityHistoryCollection.createIndex({ testedAt: -1 });
            await this.connectivityHistoryCollection.createIndex({ isReachable: 1 });

            console.log("📊 Index de base de données créés avec succès");
        } catch (error) {
            console.error("⚠️ Erreur lors de la création des index:", error);
        }
    }

    private determineTypeZone(ville: string, population?: number): 'urbain' | 'rural' | 'semi-urbain' | 'inconnu' {
        if (population !== undefined) {
            if (population > 100000) return 'urbain';
            if (population < 2000) return 'rural';
            return 'semi-urbain';
        }
        
        const villeUpper = ville.toUpperCase();
        const grandesVilles = ['PARIS', 'LYON', 'MARSEILLE', 'TOULOUSE', 'NICE', 'NANTES', 
                              'STRASBOURG', 'MONTPELLIER', 'BORDEAUX', 'LILLE', 'RENNES', 
                              'REIMS', 'SAINT-ÉTIENNE', 'TOULON', 'ANGERS', 'GRENOBLE',
                              'DIJON', 'NÎMES', 'AIX-EN-PROVENCE', 'BREST', 'LIMOGES', 'TOURS',
                              'AMIENS', 'PERPIGNAN', 'BOULOGNE-BILLANCOURT', 'METZ', 'BESANÇON',
                              'ORLÉANS', 'MULHOUSE', 'ROUEN', 'SAINT-DENIS', 'MONTREUIL',
                              'ARGENTEUIL', 'CAEN', 'NANCY', 'TOURCOING', 'ROUBAIX'];
        
        if (grandesVilles.some(gv => villeUpper.includes(gv))) {
            return 'urbain';
        }
        
        if (villeUpper.includes('SAINT-') || villeUpper.includes('SAINTE-') ||
            villeUpper.match(/\b(VILLAGE|HAMEAU|BOURG)\b/)) {
            return 'rural';
        }
        
        return 'inconnu';
    }

    private generateNraData(dslamData: DslamInfoDB[]): NraInfo[] {
        const nraMap = new Map<string, NraInfo>();
        const now = new Date();

        dslamData.forEach(dslam => {
            if (!dslam.nra || dslam.nra.trim() === '') return;

            const nraKey = dslam.nra.trim();
            
            if (nraMap.has(nraKey)) {
                const existingNra = nraMap.get(nraKey)!;
                existingNra.nombreDslam++;
                
                if (!existingNra.ipv4 && dslam.ipv4) {
                    existingNra.ipv4 = dslam.ipv4;
                }
                if (!existingNra.ipv6 && dslam.ipv6) {
                    existingNra.ipv6 = dslam.ipv6;
                }
            } else {
                nraMap.set(nraKey, {
                    nra: nraKey,
                    ville: dslam.ville,
                    localisation: dslam.localisation,
                    ipv4: dslam.ipv4,
                    ipv6: dslam.ipv6,
                    fonctionnel: false, // Par défaut, sera calculé plus tard
                    dateCreation: now,
                    dateModification: now,
                    nombreDslam: 1,
                    departement: dslam.departement,
                    region: dslam.region,
                    typeZone: dslam.typeZone
                });
            }
        });

        return Array.from(nraMap.values());
    }

    // PHASE 1: Collecte de tous les DSLAM/NRA
    async collectAllDslamData(): Promise<GlobalProcessingResult> {
        const startTime = new Date();
        console.log("🚀 PHASE 1: Début de la collecte de tous les DSLAM français");
        
        const departements = [
            ...Array.from({length: 95}, (_, i) => String(i + 1).padStart(2, '0')),
            '2A', '2B', '971', '972', '973', '974', '975', '976'
        ];

        const phasesCompleted: ProcessingPhaseResult[] = [];
        let totalDslamCollected = 0;
        let totalNraCollected = 0;
        const totalErrors: any[] = [];
        const departmentSummary: { [departement: string]: { dslamCount: number; reachableCount: number; reachabilityRate: number; } } = {};

        for (let i = 0; i < departements.length; i++) {
            const dpt = departements[i];
            const phaseStartTime = new Date();
            
            console.log(`🔍 [${i + 1}/${departements.length}] Collecte département ${dpt}...`);
            
            try {
                const dslamData: DslamInfoDB[] = await this.dslamCollection.find({ departement: dpt }).toArray();
                
                if (!dslamData ||  dslamData.length === 0) {
                    throw new Error(`Échec extraction département ${dpt}: Aucun résultat trouvé`);
                }

                const nraData = this.generateNraData(dslamData);

                // Sauvegarde en base avec upsert
                let dslamInserted = 0;
                let dslamUpdated = 0;
                let nraInserted = 0;
                let nraUpdated = 0;
                const phaseErrors: any[] = [];

                // Sauvegarde DSLAM
                for (const dslam of dslamData) {
                    try {
                        const filter = { dslam: dslam.dslam };
                        const { dateCreation, ...dslamDataWithoutDateCreation } = dslam;
                        
                        const updateDoc = {
                            $set: {
                                ...dslamDataWithoutDateCreation,
                                dateModification: new Date()
                            },
                            $setOnInsert: { dateCreation: new Date() }
                        };

                        const updateResult = await this.dslamCollection.updateOne(
                            filter, updateDoc, { upsert: true }
                        );

                        if (updateResult.upsertedCount > 0) dslamInserted++;
                        else if (updateResult.modifiedCount > 0) dslamUpdated++;
                    } catch (error) {
                        phaseErrors.push({ type: 'dslam', data: dslam, error });
                    }
                }

                // Sauvegarde NRA
                for (const nra of nraData) {
                    try {
                        const filter = { nra: nra.nra };
                        const { dateCreation, ...nraDataWithoutDateCreation } = nra;
                        
                        const updateDoc = {
                            $set: {
                                ...nraDataWithoutDateCreation,
                                dateModification: new Date()
                            },
                            $setOnInsert: { dateCreation: new Date() }
                        };

                        const updateResult = await this.nraCollection.updateOne(
                            filter, updateDoc, { upsert: true }
                        );

                        if (updateResult.upsertedCount > 0) nraInserted++;
                        else if (updateResult.modifiedCount > 0) nraUpdated++;
                    } catch (error) {
                        phaseErrors.push({ type: 'nra', data: nra, error });
                    }
                }

                const phaseEndTime = new Date();
                const phaseDuration = phaseEndTime.getTime() - phaseStartTime.getTime();
                
                phasesCompleted.push({
                    phase: 'collection',
                    departement: dpt,
                    success: true,
                    startTime: phaseStartTime,
                    endTime: phaseEndTime,
                    duration: phaseDuration,
                    itemsProcessed: dslamData.length + nraData.length,
                    itemsSuccessful: dslamInserted + dslamUpdated + nraInserted + nraUpdated,
                    itemsFailed: phaseErrors.length,
                    errors: phaseErrors
                });

                totalDslamCollected += dslamData.length;
                totalNraCollected += nraData.length;
                totalErrors.push(...phaseErrors);

                departmentSummary[dpt] = {
                    dslamCount: dslamData.length,
                    reachableCount: 0, // Sera mis à jour après les tests
                    reachabilityRate: 0
                };

                console.log(`✅ Département ${dpt} terminé: ${dslamData.length} DSLAM, ${nraData.length} NRA (${phaseDuration}ms)`);
                
                // Pause entre départements
                if (i < departements.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                const phaseEndTime = new Date();
                const phaseDuration = phaseEndTime.getTime() - phaseStartTime.getTime();
                
                phasesCompleted.push({
                    phase: 'collection',
                    departement: dpt,
                    success: false,
                    startTime: phaseStartTime,
                    endTime: phaseEndTime,
                    duration: phaseDuration,
                    itemsProcessed: 0,
                    itemsSuccessful: 0,
                    itemsFailed: 1,
                    errors: [{ type: 'department_error', departement: dpt, error }]
                });

                totalErrors.push({ departement: dpt, phase: 'collection', error });
                console.error(`❌ Erreur département ${dpt}:`, error);
            }
        }

        const endTime = new Date();
        const overallDuration = endTime.getTime() - startTime.getTime();

        console.log(`\n🎉 PHASE 1 TERMINÉE !`);
        console.log(`📊 DSLAM collectés: ${totalDslamCollected}`);
        console.log(`📊 NRA collectés: ${totalNraCollected}`);
        console.log(`⏱️ Durée totale: ${Math.round(overallDuration/1000)}s`);
        console.log(`⚠️ Erreurs: ${totalErrors.length}`);

        return {
            totalDepartements: departements.length,
            phasesCompleted,
            globalStats: {
                totalDslamCollected,
                totalNraCollected,
                totalDslamTested: 0,
                totalDslamReachable: 0,
                globalReachabilityRate: 0,
                qualityBreakdown: undefined
            },
            departmentSummary,
            totalErrors,
            overallDuration
        };
    }

    // PHASE 2: Test de connectivité
    async testAllConnectivity(batchSize: number = 10): Promise<void> {
        console.log("🔍 PHASE 2: Test de connectivité de tous les DSLAM");
        
        const cursor = this.dslamCollection.find({});
        const totalDslam = await this.dslamCollection.countDocuments({});
        
        console.log(`📊 ${totalDslam} DSLAM à tester`);
        
        let processed = 0;
        let reachable = 0;
        const batch: DslamInfoDB[] = [];
        
        while (await cursor.hasNext()) {
            const dslam = await cursor.next();
            if (dslam) {
                batch.push(dslam);
                
                if (batch.length >= batchSize) {
                    const batchResults = await this.testBatchConnectivity(batch);
                    const batchReachable = batchResults.filter(r => r.isReachable).length;
                    
                    processed += batch.length;
                    reachable += batchReachable;
                    
                    console.log(`⚡ Lot testé: ${processed}/${totalDslam} (${Math.round((processed/totalDslam)*100)}%) - Joignables: ${reachable}/${processed} (${Math.round((reachable/processed)*100)}%)`);
                    
                    // Vider le lot
                    batch.length = 0;
                    
                    // Petite pause
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        }
        
        // Traiter le dernier lot s'il reste des éléments
        if (batch.length > 0) {
            const batchResults = await this.testBatchConnectivity(batch);
            const batchReachable = batchResults.filter(r => r.isReachable).length;
            processed += batch.length;
            reachable += batchReachable;
        }
        
        await cursor.close();
        
        console.log(`✅ PHASE 2 TERMINÉE !`);
        console.log(`📊 DSLAM testés: ${processed}`);
        console.log(`📊 DSLAM joignables: ${reachable}`);
        console.log(`📊 Taux de réussite: ${Math.round((reachable/processed)*100)}%`);
        
        // Mise à jour des NRA basée sur leurs DSLAM
        await this.updateNraFunctionalStatus();
    }

    private async testBatchConnectivity(dslams: DslamInfoDB[]): Promise<ConnectivityTestResult[]> {
        const connectivityManager = new ConnectivityTester();
        const results: ConnectivityTestResult[] = [];
        
        for (const dslam of dslams) {
            try {   
                const testResult = await connectivityManager.testDslamConnectivity(dslam);
                results.push(testResult);
                
                // Sauvegarder le résultat de connectivité
                await this.connectivityHistoryCollection.insertOne(testResult);
                
                // Mettre à jour le statut du DSLAM
                await this.dslamCollection.updateOne(
                    { dslam: dslam.dslam },
                    {
                        $set: {
                            fonctionnel: testResult.isReachable,
                            dernierTestConnectivite: testResult.testedAt,
                            connectiviteScore: testResult.connectivityScore,
                            qualiteReseau: testResult.networkQuality,
                            dateModification: new Date()
                        }
                    }
                );
                
            } catch (error) {
                console.error(`Erreur test DSLAM ${dslam.dslam}:`, error);
                results.push({
                    dslam: dslam.dslam,
                    nra: dslam.nra,
                    ipv4Reachable: false,
                    ipv4PingReachable: false,
                    ipv4UdpReachable: false,
                    ipv6Reachable: false,
                    isReachable: false,
                    connectivityScore: 0,
                    networkQuality: 'unavailable',
                    testedAt: new Date(),
                    errorDetails: error instanceof Error ? error.message : String(error)
                });
            }
        }
        
        return results;
    }

    public async updateNraFunctionalStatus(): Promise<void> {
        console.log("🔄 Mise à jour du statut fonctionnel des NRA...");
        
        const nraStats = await this.dslamCollection.aggregate([
            {
                $group: {
                    _id: '$nra',
                    totalDslam: { $sum: 1 },
                    functionalDslam: { $sum: { $cond: ['$fonctionnel', 1, 0] } },
                    avgConnectivityScore: { $avg: '$connectiviteScore' }
                }
            },
            {
                $project: {
                    nra: '$_id',
                    isFunctional: { $gt: ['$functionalDslam', 0] },
                    functionalRate: { 
                        $multiply: [
                            { $divide: ['$functionalDslam', '$totalDslam'] }, 
                            100
                        ] 
                    },
                    avgScore: { $ifNull: ['$avgConnectivityScore', 0] }
                }
            }
        ]).toArray();

        for (const stat of nraStats) {
            await this.nraCollection.updateOne(
                { nra: stat.nra },
                {
                    $set: {
                        fonctionnel: stat.isFunctional,
                        tauxDslamFonctionnels: Math.round(stat.functionalRate),
                        dernierTestConnectivite: new Date(),
                        dateModification: new Date()
                    }
                }
            );
        }
        
        console.log(`✅ ${nraStats.length} NRA mis à jour`);
    }

    // PHASE 3: Processus complet harmonisé
    async runCompleteHarmonizedProcess(): Promise<GlobalProcessingResult> {
        console.log("🌟 DÉMARRAGE DU PROCESSUS HARMONISÉ COMPLET");
        console.log("=" .repeat(50));
        
        const globalStartTime = new Date();
        let result: GlobalProcessingResult;
        
        try {
            // PHASE 1: Collecte de tous les DSLAM/NRA
            console.log("\n📥 PHASE 1: Collecte des données DSLAM/NRA");
            result = await this.collectAllDslamData();
            
            // PHASE 2: Tests de connectivité
            console.log("\n🔍 PHASE 2: Tests de connectivité");
            await this.testAllConnectivity(8); // Lots de 8 pour équilibrer performance/charge
            
            // PHASE 3: Calcul des statistiques finales
            console.log("\n📊 PHASE 3: Calcul des statistiques finales");
            const finalStats = await this.calculateFinalStatistics();
            
            result.globalStats = {
                ...result.globalStats,
                ...finalStats
            };
            
            const globalEndTime = new Date();
            result.overallDuration = globalEndTime.getTime() - globalStartTime.getTime();
            
            // Affichage du rapport final
            this.displayFinalReport(result);
            
            return result;
            
        } catch (error) {
            console.error("💥 Erreur critique dans le processus harmonisé:", error);
            throw error;
        }
    }

    private async calculateFinalStatistics() {
        const dslamStats = await this.dslamCollection.aggregate([
            {
                $group: {
                    _id: null,
                    totalDslamTested: { $sum: 1 },
                    totalDslamReachable: { $sum: { $cond: ['$fonctionnel', 1, 0] } },
                    avgConnectivityScore: { $avg: '$connectiviteScore' },
                    excellentQuality: { $sum: { $cond: [{ $eq: ['$qualiteReseau', 'excellent'] }, 1, 0] } },
                    goodQuality: { $sum: { $cond: [{ $eq: ['$qualiteReseau', 'good'] }, 1, 0] } },
                    poorQuality: { $sum: { $cond: [{ $eq: ['$qualiteReseau', 'poor'] }, 1, 0] } }
                }
            }
        ]).toArray();
        
        const stats = dslamStats[0] || { totalDslamTested: 0, totalDslamReachable: 0 };
        
        // Stats par département
        const departmentStats = await this.dslamCollection.aggregate([
            {
                $group: {
                    _id: '$departement',
                    dslamCount: { $sum: 1 },
                    reachableCount: { $sum: { $cond: ['$fonctionnel', 1, 0] } }
                }
            },
            {
                $project: {
                    departement: '$_id',
                    dslamCount: 1,
                    reachableCount: 1,
                    reachabilityRate: {
                        $cond: [
                            { $eq: ['$dslamCount', 0] },
                            0,
                            { $multiply: [{ $divide: ['$reachableCount', '$dslamCount'] }, 100] }
                        ]
                    }
                }
            }
        ]).toArray();
        
        const departmentSummary: { [departement: string]: { dslamCount: number; reachableCount: number; reachabilityRate: number; } } = {};
        
        departmentStats.forEach(dept => {
            departmentSummary[dept.departement] = {
                dslamCount: dept.dslamCount,
                reachableCount: dept.reachableCount,
                reachabilityRate: Math.round(dept.reachabilityRate)
            };
        });
        
        return {
            totalDslamTested: stats.totalDslamTested,
            totalDslamReachable: stats.totalDslamReachable,
            globalReachabilityRate: stats.totalDslamTested > 0 ? 
                Math.round((stats.totalDslamReachable / stats.totalDslamTested) * 100) : 0,
            departmentSummary,
            qualityBreakdown: {
                excellent: stats.excellentQuality || 0,
                good: stats.goodQuality || 0,
                poor: stats.poorQuality || 0,
                unavailable: (stats.totalDslamTested || 0) - (stats.totalDslamReachable || 0)
            }
        };
    }

    private displayFinalReport(result: GlobalProcessingResult): void {
        console.log("\n" + "🎯 RAPPORT FINAL".padStart(30, "=").padEnd(60, "="));
        console.log(`⏱️  Durée totale: ${Math.round(result.overallDuration / 1000)}s`);
        console.log(`📊 Départements traités: ${result.totalDepartements}`);
        console.log(`📊 DSLAM collectés: ${result.globalStats.totalDslamCollected}`);
        console.log(`📊 NRA collectés: ${result.globalStats.totalNraCollected}`);
        console.log(`📊 DSLAM testés: ${result.globalStats.totalDslamTested}`);
        console.log(`📊 DSLAM joignables: ${result.globalStats.totalDslamReachable}`);
        console.log(`📊 Taux de réussite global: ${result.globalStats.globalReachabilityRate}%`);
        
        if (result.globalStats.qualityBreakdown) {
            console.log("\n📈 QUALITÉ DU RÉSEAU:");
            console.log(`   🟢 Excellent: ${result.globalStats.qualityBreakdown.excellent}`);
            console.log(`   🟡 Bon: ${result.globalStats.qualityBreakdown.good}`);
            console.log(`   🟠 Faible: ${result.globalStats.qualityBreakdown.poor}`);
            console.log(`   🔴 Indisponible: ${result.globalStats.qualityBreakdown.unavailable}`);
        }
        
        // Top 10 départements avec meilleur taux
        const topDepartments = Object.entries(result.departmentSummary)
            .sort((a, b) => b[1].reachabilityRate - a[1].reachabilityRate)
            .slice(0, 10);
            
        console.log("\n🏆 TOP 10 DÉPARTEMENTS (Taux de réussite):");
        topDepartments.forEach(([dept, stats], index) => {
            console.log(`   ${(index + 1).toString().padStart(2, ' ')}. ${dept}: ${stats.reachabilityRate}% (${stats.reachableCount}/${stats.dslamCount})`);
        });
        
        // Départements avec problèmes
        const problematicDepts = Object.entries(result.departmentSummary)
            .filter(([_, stats]) => stats.reachabilityRate < 50)
            .sort((a, b) => a[1].reachabilityRate - b[1].reachabilityRate);
            
        if (problematicDepts.length > 0) {
            console.log("\n⚠️  DÉPARTEMENTS AVEC PROBLÈMES (<50% réussite):");
            problematicDepts.forEach(([dept, stats]) => {
                console.log(`   🔴 ${dept}: ${stats.reachabilityRate}% (${stats.reachableCount}/${stats.dslamCount})`);
            });
        }
        
        console.log("\n" + "=".repeat(60));
    }

    // Méthodes utilitaires pour analyses post-traitement
    async getDetailedConnectivityReport(departement?: string): Promise<{
        summary: any;
        byRegion: any[];
        connectivityTrends: any[];
        problemAreas: any[];
    }> {
        const matchStage = departement ? { $match: { departement } } : { $match: {} };
        
        // Résumé général
        const summary = await this.dslamCollection.aggregate([
            matchStage,
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    functional: { $sum: { $cond: ['$fonctionnel', 1, 0] } },
                    avgScore: { $avg: '$connectiviteScore' },
                    lastTested: { $max: '$dernierTestConnectivite' }
                }
            }
        ]).toArray();
        
        // Par région
        const byRegion = await this.dslamCollection.aggregate([
            matchStage,
            {
                $group: {
                    _id: '$region',
                    total: { $sum: 1 },
                    functional: { $sum: { $cond: ['$fonctionnel', 1, 0] } },
                    avgScore: { $avg: '$connectiviteScore' }
                }
            },
            {
                $project: {
                    region: '$_id',
                    total: 1,
                    functional: 1,
                    rate: { $multiply: [{ $divide: ['$functional', '$total'] }, 100] },
                    avgScore: { $round: ['$avgScore', 1] }
                }
            },
            { $sort: { rate: -1 } }
        ]).toArray();
        
        // Tendances de connectivité (par qualité réseau)
        const connectivityTrends = await this.dslamCollection.aggregate([
            matchStage,
            {
                $group: {
                    _id: '$qualiteReseau',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]).toArray();
        
        // Zones problématiques
        const problemAreas = await this.dslamCollection.aggregate([
            matchStage,
            { $match: { fonctionnel: false } },
            {
                $group: {
                    _id: { ville: '$ville', nra: '$nra' },
                    problematicDslam: { $sum: 1 },
                    lastError: { $max: '$dernierTestConnectivite' }
                }
            },
            { $sort: { problematicDslam: -1 } },
            { $limit: 20 }
        ]).toArray();
        
        return {
            summary: summary[0] || {},
            byRegion,
            connectivityTrends,
            problemAreas
        };
    }

    async retestFailedDslam(maxRetests: number = 100): Promise<{
        retested: number;
        newlyFunctional: number;
        stillFailed: number;
        improvedRate: number;
    }> {
        console.log(`🔄 Nouveau test des DSLAM non fonctionnels (max: ${maxRetests})`);
        
        const failedDslam = await this.dslamCollection
            .find({ fonctionnel: false })
            .limit(maxRetests)
            .toArray();
        
        console.log(`🎯 ${failedDslam.length} DSLAM à retester`);
        
        const connectivityManager = new ConnectivityTester();
        let newlyFunctional = 0;
        let stillFailed = 0;
        
        for (const dslam of failedDslam) {
            try {
                const testResult = await connectivityManager.testDslamConnectivity(dslam);
                
                // Sauvegarder le nouveau résultat
                await this.connectivityHistoryCollection.insertOne(testResult);
                
                // Mettre à jour le DSLAM
                await this.dslamCollection.updateOne(
                    { dslam: dslam.dslam },
                    {
                        $set: {
                            fonctionnel: testResult.isReachable,
                            dernierTestConnectivite: testResult.testedAt,
                            connectiviteScore: testResult.connectivityScore,
                            qualiteReseau: testResult.networkQuality,
                            dateModification: new Date()
                        }
                    }
                );
                
                if (testResult.isReachable && !dslam.fonctionnel) {
                    newlyFunctional++;
                    console.log(`✅ ${dslam.dslam} maintenant fonctionnel!`);
                } else {
                    stillFailed++;
                }
                
                // Pause entre tests
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                stillFailed++;
                console.error(`❌ Erreur retest ${dslam.dslam}:`, error);
            }
        }
        
        const improvedRate = failedDslam.length > 0 ? 
            Math.round((newlyFunctional / failedDslam.length) * 100) : 0;
        
        console.log(`🎯 Retest terminé: ${newlyFunctional} nouvellement fonctionnels, ${stillFailed} toujours en échec`);
        console.log(`📈 Taux d'amélioration: ${improvedRate}%`);
        
        // Mettre à jour les NRA après les retests
        await this.updateNraFunctionalStatus();
        
        return {
            retested: failedDslam.length,
            newlyFunctional,
            stillFailed,
            improvedRate
        };
    }
}

// ConnectivityTester corrigé - remplace la classe dans index.ts

class ConnectivityTester {
    private calculateConnectivityScore(result: {
        ipv4PingReachable: boolean;
        ipv4UdpReachable: boolean;
        ipv6Reachable: boolean;
        responseTime?: number;
    }): number {
        let score = 0;
        
        if (result.ipv4PingReachable) score += 30;
        if (result.ipv4UdpReachable) score += 40;
        if (result.ipv6Reachable) score += 30;
        
        if (result.responseTime !== undefined) {
            if (result.responseTime < 50) score += 5;
            else if (result.responseTime < 100) score += 2;
            else if (result.responseTime > 1000) score -= 5;
        }
        
        return Math.min(100, Math.max(0, score));
    }

    private determineNetworkQuality(score: number, isReachable: boolean): 'excellent' | 'good' | 'poor' | 'unavailable' {
        if (!isReachable) return 'unavailable';
        if (score >= 80) return 'excellent';
        if (score >= 60) return 'good';
        return 'poor';
    }

    // VRAIE méthode de test UDP (copiée depuis checkDslam.ts)
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

    // VRAIE méthode de ping (copiée depuis checkDslam.ts)
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

    // Test IPv4 complet (copiée depuis checkDslam.ts)
    async testIPv4Complete(ip: string): Promise<{
        ping: boolean;
        udp161: boolean;
        reachable: boolean;
        responseTime?: number;
    }> {
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

    // Méthode principale de test avec VRAIES méthodes
    async testDslamConnectivity(dslam: DslamInfoDB): Promise<ConnectivityTestResult> {
        const promises: Array<Promise<{ type: string; result: any }>> = [];
        const testStartTime = new Date();

        console.log(`🔍 Test réel de connectivité pour DSLAM: ${dslam.dslam}`);
        console.log(`   IPv4: ${dslam.ipv4 || 'N/A'}`);
        console.log(`   IPv6: ${dslam.ipv6 || 'N/A'}`);

        // Test IPv4 si disponible
        if (dslam.ipv4 && dslam.ipv4 !== 'N/A' && !dslam.ipv4.includes('Non trouvé') && !dslam.ipv4.includes('Erreur')) {
            promises.push(
                this.testIPv4Complete(dslam.ipv4).then(result => ({ type: 'ipv4', result }))
            );
        }
        
        // Test IPv6 si disponible
        if (dslam.ipv6 && !['Non trouvé', 'Erreur', 'N/A'].includes(dslam.ipv6)) {
            promises.push(
                this.pingIP(dslam.ipv6, true).then(result => ({ type: 'ipv6', result }))
            );
        }
        
        const results = await Promise.all(promises);
        
        const finalResult: ConnectivityTestResult = {
            dslam: dslam.dslam,
            nra: dslam.nra,
            ipv4Reachable: false,
            ipv4PingReachable: false,
            ipv4UdpReachable: false,
            ipv6Reachable: false,
            isReachable: false,
            testedAt: testStartTime,
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
                console.log(`   ✓ IPv4 ${dslam.ipv4}: Ping=${result.ping}, UDP=${result.udp161}, Time=${result.responseTime}ms`);
            } else if (type === 'ipv6') {
                finalResult.ipv6Reachable = result.success;
                if (result.responseTime && (!bestResponseTime || result.responseTime < bestResponseTime)) {
                    bestResponseTime = result.responseTime;
                }
                console.log(`   ✓ IPv6 ${dslam.ipv6}: Success=${result.success}, Time=${result.responseTime}ms`);
            }
        });
        
        finalResult.isReachable = finalResult.ipv4Reachable || finalResult.ipv6Reachable;
        finalResult.responseTime = bestResponseTime;
        finalResult.connectivityScore = this.calculateConnectivityScore(finalResult);
        finalResult.networkQuality = this.determineNetworkQuality(finalResult.connectivityScore, finalResult.isReachable);
        
        const status = finalResult.isReachable ? '✅ JOIGNABLE' : '❌ NON JOIGNABLE';
        console.log(`   ${status} - Score: ${finalResult.connectivityScore}/100 - Qualité: ${finalResult.networkQuality}`);
        
        return finalResult;
    }
}
// Fonctions utilitaires exportées
export async function runHarmonizedDslamProcess(): Promise<void> {
    const dbManager = new DslamDBManager();
    
    try {
        await dbManager.connect();
        const result = await dbManager.runCompleteHarmonizedProcess();
        
        // Optionnel: générer un rapport détaillé
        console.log("\n📋 Génération du rapport détaillé...");
        const detailedReport = await dbManager.getDetailedConnectivityReport();
        console.log("📊 Rapport détaillé généré:", {
            totalAnalyzed: detailedReport.summary.total,
            functionalRate: Math.round((detailedReport.summary.functional / detailedReport.summary.total) * 100),
            avgScore: Math.round(detailedReport.summary.avgScore || 0),
            regionsAnalyzed: detailedReport.byRegion.length,
            problemAreasFound: detailedReport.problemAreas.length
        });
        
    } catch (error) {
        console.error("💥 Erreur dans le processus harmonisé:", error);
        throw error;
    } finally {
        await dbManager.disconnect();
    }
}

export async function retestFailedDslamOnly(): Promise<void> {
    const dbManager = new DslamDBManager();
    
    try {
        await dbManager.connect();
        await dbManager.retestFailedDslam(16049); // Retester jusqu'à 200 DSLAM défaillants
    } catch (error) {
        console.error("💥 Erreur lors du retest:", error);
        throw error;
    } finally {
        await dbManager.disconnect();
    }
}

// Export des classes et types
export { 
    DslamDBManager,
};
