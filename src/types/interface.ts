/*Fichier d'export interface  */

export interface DslamInfo {
    ville: string;
    nra: string;
    localisation: string;
    dslam: string;
    ipv4: string;
    ipv6: string;
    dateInstallation: string;
    dateMiseEnService: string;
    departement?: string; // Ajout du département
}

// Interface pour les réponses d'API avec gestion d'erreur
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
}
export interface ConnectivityResult extends DslamInfo {
    ipv4Reachable: boolean;
    ipv4PingReachable: boolean;
    ipv4UdpReachable: boolean;
    ipv6Reachable: boolean;
    isReachable: boolean;
    // Nouvelles propriétés pour diagnostics avancés
    responseTime?: number; // Temps de réponse en ms
    lastTestedAt: Date;
    connectivityScore: number; // Score de 0 à 100
    networkQuality: 'excellent' | 'good' | 'poor' | 'unavailable';
}

export interface IPv4TestResult {
    ping: boolean;
    udp161: boolean;
    reachable: boolean;
    responseTime?: number;
}

export interface DslamInfo {
    ville: string;
    nra: string;
    localisation: string;
    dslam: string;
    ipv4: string;
    ipv6: string;
    dateInstallation: string;
    dateMiseEnService: string;
    departement?: string; // Ajout du département
}

export interface ConnectivityStats {
    total: number;
    reachable: number;
    unreachable: number;
    reachabilityRate: number;
    ipv4Only: number;
    ipv6Only: number;
    both: number;
    udpReachable: number;
    // Nouvelles stats
    averageResponseTime: number;
    excellentQuality: number;
    goodQuality: number;
    poorQuality: number;
}

export interface ConnectivityReport {
    all: ConnectivityResult[];
    reachable: ConnectivityResult[];
    unreachable: ConnectivityResult[];
    stats: ConnectivityStats;
    // Nouveau : rapport par région/département
    geographicBreakdown?: {
        [region: string]: {
            total: number;
            reachable: number;
            rate: number;
        };
    };
}

// Interface pour les stats de connectivité en base
export interface ConnectivityStatsDB {
    dslam: string;
    nra: string;
    ville: string;
    departement: string;
    region: string;
    ipv4?: string;
    ipv6?: string;
    // Résultats de connectivité
    ipv4Reachable: boolean;
    ipv4PingReachable: boolean;
    ipv4UdpReachable: boolean;
    ipv6Reachable: boolean;
    isReachable: boolean;
    responseTime?: number;
    connectivityScore: number;
    networkQuality: 'excellent' | 'good' | 'poor' | 'unavailable';
    // Méta-données
    lastTestedAt: Date;
    dateCreation: Date;
    dateModification: Date;
}

export interface DslamInfoDB {
    ville: string;
    nra: string;
    localisation: string;
    dslam: string;
    ipv4?: string;
    ipv6?: string;
    dateInstallation: string;
    dateMiseEnService: string;
    fonctionnel: boolean;
    dateCreation: Date;
    dateModification: Date;
    departement: string;
    region: string;
    codePostal?: string;
    population?: number;
    typeZone: 'urbain' | 'rural' | 'semi-urbain' | 'inconnu';
    // Ajouts pour la connectivité
    dernierTestConnectivite?: Date;
    connectiviteScore?: number;
    qualiteReseau?: 'excellent' | 'good' | 'poor' | 'unavailable';
}

export interface NraInfo {
    nra: string;
    ville: string;
    localisation: string;
    ipv4?: string;
    ipv6?: string;
    fonctionnel: boolean;
    dateCreation: Date;
    dateModification: Date;
    nombreDslam: number;
    departement: string;
    region: string;
    codePostal?: string;
    population?: number;
    typeZone: 'urbain' | 'rural' | 'semi-urbain' | 'inconnu';
    // Ajouts pour la connectivité
    dernierTestConnectivite?: Date;
    tauxDslamFonctionnels?: number; // Pourcentage des DSLAM fonctionnels
}

export interface ConnectivityTestResult {
    dslam: string;
    nra: string;
    ipv4Reachable: boolean;
    ipv4PingReachable: boolean;
    ipv4UdpReachable: boolean;
    ipv6Reachable: boolean;
    isReachable: boolean;
    responseTime?: number;
    connectivityScore: number;
    networkQuality: 'excellent' | 'good' | 'poor' | 'unavailable';
    testedAt: Date;
    errorDetails?: string;
}

export interface ProcessingPhaseResult {
    phase: 'collection' | 'connectivity' | 'update';
    departement: string;
    success: boolean;
    startTime: Date;
    endTime: Date;
    duration: number;
    itemsProcessed: number;
    itemsSuccessful: number;
    itemsFailed: number;
    errors?: any[];
}

 export interface GlobalProcessingResult {
    totalDepartements: number;
    phasesCompleted: ProcessingPhaseResult[];
    globalStats: {
        qualityBreakdown: any;
        totalDslamCollected: number;
        totalNraCollected: number;
        totalDslamTested: number;
        totalDslamReachable: number;
        globalReachabilityRate: number;
    };
    departmentSummary: {
        [departement: string]: {
            dslamCount: number;
            reachableCount: number;
            reachabilityRate: number;
        };
    };
    totalErrors: any[];
    overallDuration: number;
}

