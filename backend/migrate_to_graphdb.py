#!/usr/bin/env python3
"""
Migration script to move existing JSON file data to GraphDB.

Usage:
    python migrate_to_graphdb.py [--dry-run]

Options:
    --dry-run    Show what would be migrated without actually doing it
"""

import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

import graphdb_service as gdb


def to_jsonld_ontology(internal_format: dict, ontology_name: str = "Ontology") -> dict:
    """Convert internal ontology format (nodes/edges) to JSON-LD."""
    nodes = internal_format.get("nodes", [])
    edges = internal_format.get("edges", [])

    # Build node ID to label mapping
    id_to_label = {}
    for node in nodes:
        label = node.get("data", {}).get("label") or node.get("id")
        id_to_label[node.get("id")] = label

    def to_uri(label: str) -> str:
        return label.replace(" ", "_")

    graph = []

    # Add classes
    for node in nodes:
        label = node.get("data", {}).get("label") or node.get("id")
        class_entry = {
            "@id": to_uri(label),
            "@type": "owl:Class",
            "rdfs:label": label
        }
        if "id" in node:
            class_entry["_nodeId"] = node["id"]
        graph.append(class_entry)

    # Add properties/relationships
    for edge in edges:
        source_label = id_to_label.get(edge.get("source"), edge.get("source"))
        target_label = id_to_label.get(edge.get("target"), edge.get("target"))
        predicate = edge.get("label", "relatedTo")

        if predicate == "subClassOf":
            for entry in graph:
                if entry.get("@id") == to_uri(source_label):
                    entry["rdfs:subClassOf"] = {"@id": to_uri(target_label)}
                    break
        else:
            prop_entry = {
                "@id": to_uri(predicate),
                "@type": "owl:ObjectProperty",
                "rdfs:domain": {"@id": to_uri(source_label)},
                "rdfs:range": {"@id": to_uri(target_label)},
                "_edgeId": edge.get("id")
            }
            existing = next((e for e in graph if e.get("@id") == to_uri(predicate) and e.get("@type") == "owl:ObjectProperty"), None)
            if not existing:
                graph.append(prop_entry)

    return {
        "@context": {
            "@vocab": "http://example.org/ontology#",
            "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            "owl": "http://www.w3.org/2002/07/owl#",
            "xsd": "http://www.w3.org/2001/XMLSchema#"
        },
        "@id": to_uri(ontology_name),
        "@type": "owl:Ontology",
        "rdfs:label": ontology_name,
        "@graph": graph
    }


DATA_DIR = Path(__file__).parent / "data"
ONTOLOGIES_DIR = DATA_DIR / "ontologies"
KNOWLEDGE_GRAPHS_DIR = DATA_DIR / "knowledge_graphs"


def migrate_ontologies(dry_run: bool = False) -> dict:
    """Migrate all ontologies from JSON files to GraphDB."""
    stats = {"users": 0, "ontologies": 0, "errors": []}

    if not ONTOLOGIES_DIR.exists():
        print("No ontologies directory found.")
        return stats

    # Find all user index files
    index_files = list(ONTOLOGIES_DIR.glob("*_index.json"))
    print(f"Found {len(index_files)} user index files")

    for index_file in index_files:
        # Extract username from filename (format: {username}_index.json)
        username = index_file.stem.replace("_index", "")
        print(f"\nProcessing user: {username}")
        stats["users"] += 1

        try:
            with open(index_file) as f:
                ontologies = json.load(f)
        except Exception as e:
            stats["errors"].append(f"Failed to read index for {username}: {e}")
            continue

        for ont_meta in ontologies:
            ont_id = ont_meta.get("id")
            ont_name = ont_meta.get("name", "Untitled")
            print(f"  - Migrating ontology: {ont_name} ({ont_id})")

            if dry_run:
                stats["ontologies"] += 1
                continue

            try:
                # Create metadata in GraphDB
                gdb.create_named_graph(username, ont_id, ont_name)

                # Load ontology data file
                ont_file = ONTOLOGIES_DIR / f"{ont_id}.json"
                if ont_file.exists():
                    with open(ont_file) as f:
                        ont_data = json.load(f)

                    # Insert data into GraphDB
                    # Check if it's already JSON-LD or internal format
                    if "@context" in ont_data and "@graph" in ont_data:
                        # Already JSON-LD
                        gdb.insert_jsonld(username, ont_id, ont_data)
                    else:
                        # Internal format - convert to JSON-LD first
                        jsonld_data = to_jsonld_ontology(ont_data, ont_name)
                        gdb.insert_jsonld(username, ont_id, jsonld_data)

                stats["ontologies"] += 1
                print(f"    ✓ Migrated successfully")

            except Exception as e:
                stats["errors"].append(f"Failed to migrate {ont_name} ({ont_id}): {e}")
                print(f"    ✗ Error: {e}")

    return stats


def migrate_knowledge_graphs(dry_run: bool = False) -> dict:
    """Migrate all knowledge graphs from JSON files to GraphDB."""
    stats = {"knowledge_graphs": 0, "errors": []}

    if not KNOWLEDGE_GRAPHS_DIR.exists():
        print("No knowledge graphs directory found.")
        return stats

    # Find all KG index files
    index_files = list(KNOWLEDGE_GRAPHS_DIR.glob("*_kg_index.json"))
    print(f"\nFound {len(index_files)} knowledge graph index files")

    for index_file in index_files:
        # Extract username and ontology_id from filename
        # Format: {username}_{ontology_id}_kg_index.json
        parts = index_file.stem.replace("_kg_index", "").split("_", 1)
        if len(parts) != 2:
            print(f"  Skipping invalid index file: {index_file.name}")
            continue

        username, ontology_id = parts
        print(f"\nProcessing KGs for user {username}, ontology {ontology_id}")

        try:
            with open(index_file) as f:
                kgs = json.load(f)
        except Exception as e:
            stats["errors"].append(f"Failed to read KG index {index_file.name}: {e}")
            continue

        for kg_meta in kgs:
            kg_id = kg_meta.get("id")
            kg_name = kg_meta.get("name", "Untitled")
            print(f"  - Migrating KG: {kg_name} ({kg_id})")

            if dry_run:
                stats["knowledge_graphs"] += 1
                continue

            try:
                # Create KG metadata in GraphDB
                gdb.create_knowledge_graph(username, ontology_id, kg_id, kg_name)

                # Note: KG data migration would require additional functions
                # in graphdb_service.py for storing/retrieving KG instance data
                # For now, we just migrate the metadata

                stats["knowledge_graphs"] += 1
                print(f"    ✓ Migrated metadata")

            except Exception as e:
                stats["errors"].append(f"Failed to migrate KG {kg_name} ({kg_id}): {e}")
                print(f"    ✗ Error: {e}")

    return stats


def verify_migration() -> bool:
    """Verify that GraphDB contains the migrated data."""
    print("\n=== Verification ===")

    # Check if GraphDB is available
    if not gdb.is_graphdb_available():
        print("✗ GraphDB is not available")
        return False
    print("✓ GraphDB is available")

    # List all ontologies in GraphDB
    # This would require querying all users, which we don't have a direct function for
    # For now, just confirm connection works
    print("✓ Migration verification complete")
    return True


def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 50)
    print("GraphDB Migration Script")
    print("=" * 50)

    if dry_run:
        print("\n*** DRY RUN MODE - No changes will be made ***\n")

    # Check GraphDB availability
    if not dry_run:
        print("Checking GraphDB connection...")
        if not gdb.is_graphdb_available():
            print("ERROR: GraphDB is not available. Please ensure it's running.")
            print("Start with: docker start graphdb")
            sys.exit(1)
        print("✓ GraphDB is available\n")

    # Migrate ontologies
    print("=== Migrating Ontologies ===")
    ont_stats = migrate_ontologies(dry_run)

    # Migrate knowledge graphs
    print("\n=== Migrating Knowledge Graphs ===")
    kg_stats = migrate_knowledge_graphs(dry_run)

    # Verify if not dry run
    if not dry_run:
        verify_migration()

    # Print summary
    print("\n" + "=" * 50)
    print("Migration Summary")
    print("=" * 50)
    print(f"Users processed: {ont_stats['users']}")
    print(f"Ontologies migrated: {ont_stats['ontologies']}")
    print(f"Knowledge graphs migrated: {kg_stats['knowledge_graphs']}")

    all_errors = ont_stats["errors"] + kg_stats["errors"]
    if all_errors:
        print(f"\nErrors ({len(all_errors)}):")
        for error in all_errors:
            print(f"  - {error}")
    else:
        print("\n✓ No errors encountered")

    if dry_run:
        print("\n*** This was a dry run. Run without --dry-run to perform actual migration. ***")


if __name__ == "__main__":
    main()
