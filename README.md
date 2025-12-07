# 🌐 DSLAM Manager

Gestionnaire de DSLAM (Digital Subscriber Line Access Multiplexer) et NRA (Nœud de Raccordement Abonné) avec tests de connectivité automatisés pour le réseau français.

## 📋 Description

Ce projet permet de :
- 📊 Collecter et gérer les informations des DSLAM et NRA français
- 🔌 Tester la connectivité (IPv4/IPv6, ICMP ping, UDP port 161/SNMP)
- 📈 Générer des statistiques détaillées par département et région
- 🗄️ Stocker l'historique des tests dans MongoDB
- 🔄 Re-tester automatiquement les équipements défaillants

## 🚀 Installation

### Prérequis
- Node.js >= 16.x
- MongoDB >= 4.x
- `ping` et `nc` (netcat) disponibles sur le système

### Installation des dépendances

```bash
npm install
```

### Configuration

1. Copier le fichier d'exemple :
```bash
cp .env.example .env
```

2. Éditer `.env` avec vos paramètres :
```env
MONGO_URI=mongodb://localhost:27017
LOG_LEVEL=info
NODE_ENV=development
```

## 📖 Usage

### Mode complet (Collecte + Tests de connectivité)

```bash
npm start
# ou
npm run start:complete
```

Exécute le processus complet :
1. Collecte des DSLAM/NRA pour tous les départements français
2. Tests de connectivité sur tous les équipements
3. Génération des statistiques et rapports

### Mode retest (Re-tester les équipements défaillants)

```bash
npm run start:retest
```

Re-teste uniquement les DSLAM marqués comme non fonctionnels.

### Build

```bash
npm run build
```

## 🏗️ Architecture

```
.
├── src/
│   ├── index.ts              # Point d'entrée principal
│   ├── module/
│   │   ├── DslamManager.ts   # Gestion DB et processus complet
│   │   ├── checkDslam.ts     # Tests de connectivité
│   │   └── dslamInfo.ts      # [Autres utilitaires]
│   └── types/
│       └── interface.ts      # Définitions TypeScript
├── .env.example              # Template de configuration
└── package.json
```

## 🔧 Fonctionnalités

### Tests de connectivité
- ✅ **Ping IPv4/IPv6** : Test ICMP de base
- ✅ **UDP Port 161** : Test du port SNMP
- ✅ **Score de connectivité** : Évaluation 0-100
- ✅ **Qualité réseau** : Classification (excellent/good/poor/unavailable)

### Base de données MongoDB

#### Collections

**`dslams`** : Informations complètes des DSLAM
```typescript
{
  dslam: string,
  nra: string,
  ville: string,
  departement: string,
  region: string,
  ipv4?: string,
  ipv6?: string,
  fonctionnel: boolean,
  connectiviteScore?: number,
  qualiteReseau?: string,
  dernierTestConnectivite?: Date
}
```

**`nras`** : Agrégation par NRA
```typescript
{
  nra: string,
  ville: string,
  departement: string,
  nombreDslam: number,
  fonctionnel: boolean,
  tauxDslamFonctionnels?: number
}
```

**`connectivity_history`** : Historique des tests
```typescript
{
  dslam: string,
  nra: string,
  ipv4Reachable: boolean,
  ipv6Reachable: boolean,
  connectivityScore: number,
  testedAt: Date
}
```

## 📊 Statistiques générées

Le processus complet génère :
- 📍 Nombre de DSLAM par département/région
- 🎯 Taux de réussite global et par zone
- 🏆 Top 10 départements avec le meilleur taux
- ⚠️ Départements problématiques (<50% réussite)
- 📈 Répartition par qualité réseau

## 🗺️ Couverture géographique

Le système couvre l'ensemble du territoire français :
- 🇫🇷 95 départements métropolitains
- 🏝️ Départements d'outre-mer (971-976, 2A, 2B)
- 🏙️ Classification urbain/rural/semi-urbain

## 🛠️ Scripts disponibles

```json
{
  "start": "npm run build && node dist/index.js",
  "start:complete": "npm run build && node dist/index.js complete",
  "start:retest": "npm run build && node dist/index.js retest",
  "build": "tsc",
  "dev": "ts-node src/index.ts"
}
```

## 📈 Exemple de sortie

```
🌟 DÉMARRAGE DU PROCESSUS HARMONISÉ COMPLET
==================================================

🔥 PHASE 1: Collecte des données DSLAM/NRA
📍 [1/103] Collecte département 01...
✅ Département 01 terminé: 145 DSLAM, 23 NRA (2341ms)

🔍 PHASE 2: Tests de connectivité
📊 16049 DSLAM à tester
⚡ Lot testé: 1000/16049 (6%) - Joignables: 847/1000 (85%)

🎯 RAPPORT FINAL
============================================================
⏱️  Durée totale: 3847s
📊 DSLAM testés: 16049
📊 DSLAM joignables: 13642
📊 Taux de réussite global: 85%
```

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :
1. Fork le projet
2. Créer une branche (`git checkout -b feature/amelioration`)
3. Commit vos changements (`git commit -am 'Ajout fonctionnalité'`)
4. Push vers la branche (`git push origin feature/amelioration`)
5. Ouvrir une Pull Request

## ⚠️ Notes importantes

- Les adresses IP des DSLAM/NRA sont des informations **publiques**
- Les tests de connectivité sont **non-intrusifs** (ping/UDP basique)
- Temps d'exécution complet : ~1-2h pour tous les départements
- Batch size recommandé : 6-10 pour équilibrer charge/performance

## 📜 Licence

Ce projet est sous licence Apache 2.0 - voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 👨‍💻 Auteur

[Agoyami](https://github.com/agoyami)

## 🙏 Remerciements

- Données DSLAM/NRA issues de sources publiques
- MongoDB pour le stockage
- TypeScript pour le typage fort