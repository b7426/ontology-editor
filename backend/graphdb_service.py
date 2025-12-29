"""
GraphDB Service Layer

Provides functions for interacting with GraphDB triplestore.
"""

import os
import json
import requests
from typing import Any
from datetime import datetime


# Configuration
GRAPHDB_URL = os.getenv("GRAPHDB_URL", "http://localhost:7200")
GRAPHDB_REPOSITORY = os.getenv("GRAPHDB_REPOSITORY", "ontology-editor")


def get_sparql_endpoint() -> str:
    """Return the SPARQL endpoint URL for queries."""
    return f"{GRAPHDB_URL}/repositories/{GRAPHDB_REPOSITORY}"


def get_sparql_update_endpoint() -> str:
    """Return the SPARQL endpoint URL for updates."""
    return f"{GRAPHDB_URL}/repositories/{GRAPHDB_REPOSITORY}/statements"


def get_graph_uri(username: str, ontology_id: str) -> str:
    """Generate a named graph URI for an ontology."""
    return f"http://ontology-editor.local/users/{username}/ontologies/{ontology_id}"


def get_metadata_graph_uri() -> str:
    """Return the URI for the metadata graph."""
    return "http://ontology-editor.local/metadata"


def execute_sparql_query(query: str, accept: str = "application/json") -> dict | list:
    """Execute a SPARQL SELECT/CONSTRUCT query and return results."""
    endpoint = get_sparql_endpoint()
    headers = {"Accept": accept, "Content-Type": "application/sparql-query"}

    response = requests.post(endpoint, data=query, headers=headers)
    response.raise_for_status()

    if accept == "application/json":
        return response.json()
    elif accept == "application/ld+json":
        return response.json()
    else:
        return response.text


def execute_sparql_update(update: str) -> bool:
    """Execute a SPARQL UPDATE query."""
    endpoint = get_sparql_update_endpoint()
    headers = {"Content-Type": "application/sparql-update"}

    response = requests.post(endpoint, data=update, headers=headers)
    response.raise_for_status()
    return True


def graph_exists(username: str, ontology_id: str) -> bool:
    """Check if a named graph exists."""
    graph_uri = get_graph_uri(username, ontology_id)
    query = f"""
    ASK WHERE {{
        GRAPH <{graph_uri}> {{ ?s ?p ?o }}
    }}
    """
    result = execute_sparql_query(query)
    return result.get("boolean", False)


def create_named_graph(username: str, ontology_id: str, name: str) -> bool:
    """Create an empty named graph with metadata."""
    graph_uri = get_graph_uri(username, ontology_id)
    metadata_uri = get_metadata_graph_uri()
    now = datetime.utcnow().isoformat()

    update = f"""
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX ont: <http://ontology-editor.local/schema#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    INSERT DATA {{
        GRAPH <{metadata_uri}> {{
            <{graph_uri}> a ont:Ontology ;
                ont:id "{ontology_id}" ;
                ont:name "{name}" ;
                ont:owner "{username}" ;
                ont:createdAt "{now}"^^xsd:dateTime ;
                ont:updatedAt "{now}"^^xsd:dateTime .
        }}
    }}
    """
    return execute_sparql_update(update)


def delete_named_graph(username: str, ontology_id: str) -> bool:
    """Delete a named graph and its metadata."""
    graph_uri = get_graph_uri(username, ontology_id)
    metadata_uri = get_metadata_graph_uri()

    # Delete the graph contents
    update1 = f"DROP GRAPH <{graph_uri}>"

    # Delete metadata
    update2 = f"""
    DELETE WHERE {{
        GRAPH <{metadata_uri}> {{
            <{graph_uri}> ?p ?o .
        }}
    }}
    """

    try:
        execute_sparql_update(update1)
    except:
        pass  # Graph might not exist

    execute_sparql_update(update2)
    return True


def insert_jsonld(username: str, ontology_id: str, jsonld_data: dict) -> bool:
    """Insert JSON-LD data into a named graph."""
    from rdflib import Graph

    graph_uri = get_graph_uri(username, ontology_id)

    # Extract @context and @graph for parsing
    # rdflib doesn't parse @graph correctly when root object has @id/@type
    context = jsonld_data.get("@context", {})
    graph_items = jsonld_data.get("@graph", [])

    # If no @graph, treat the whole object as a single item
    if not graph_items and "@id" in jsonld_data:
        graph_items = [jsonld_data]

    # Build clean JSON-LD with only @context and @graph
    if isinstance(context, dict):
        context = dict(context)  # Make a copy
        # Add @base for URI resolution if not present
        if "@base" not in context and "@vocab" in context:
            context["@base"] = context["@vocab"]

    clean_jsonld = {
        "@context": context,
        "@graph": graph_items
    }

    # Parse JSON-LD into rdflib graph
    g = Graph()
    g.parse(data=json.dumps(clean_jsonld), format="json-ld")

    # Convert to N-Triples and wrap in SPARQL INSERT
    if len(g) == 0:
        return True  # Nothing to insert

    # Build INSERT DATA query
    triples = g.serialize(format="nt")

    update = f"""
    INSERT DATA {{
        GRAPH <{graph_uri}> {{
            {triples}
        }}
    }}
    """

    execute_sparql_update(update)
    return True


def update_ontology(username: str, ontology_id: str, jsonld_data: dict, name: str = None) -> bool:
    """Replace all data in an ontology's graph with new JSON-LD data."""
    graph_uri = get_graph_uri(username, ontology_id)
    metadata_uri = get_metadata_graph_uri()

    # Clear existing graph
    clear_update = f"CLEAR GRAPH <{graph_uri}>"
    execute_sparql_update(clear_update)

    # Insert new data
    insert_jsonld(username, ontology_id, jsonld_data)

    # Update metadata timestamp
    now = datetime.utcnow().isoformat()
    metadata_update = f"""
    PREFIX ont: <http://ontology-editor.local/schema#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    DELETE {{
        GRAPH <{metadata_uri}> {{
            <{graph_uri}> ont:updatedAt ?oldTime .
            {f'<{graph_uri}> ont:name ?oldName .' if name else ''}
        }}
    }}
    INSERT {{
        GRAPH <{metadata_uri}> {{
            <{graph_uri}> ont:updatedAt "{now}"^^xsd:dateTime .
            {f'<{graph_uri}> ont:name "{name}" .' if name else ''}
        }}
    }}
    WHERE {{
        GRAPH <{metadata_uri}> {{
            <{graph_uri}> ont:updatedAt ?oldTime .
            {f'OPTIONAL {{ <{graph_uri}> ont:name ?oldName . }}' if name else ''}
        }}
    }}
    """
    execute_sparql_update(metadata_update)

    return True


def get_ontology_as_jsonld(username: str, ontology_id: str) -> dict | None:
    """Retrieve an ontology as JSON-LD."""
    graph_uri = get_graph_uri(username, ontology_id)

    # CONSTRUCT query to get all triples from the graph
    query = f"""
    CONSTRUCT {{ ?s ?p ?o }}
    WHERE {{
        GRAPH <{graph_uri}> {{ ?s ?p ?o }}
    }}
    """

    try:
        endpoint = get_sparql_endpoint()
        headers = {
            "Accept": "application/ld+json",
            "Content-Type": "application/sparql-query"
        }

        response = requests.post(endpoint, data=query, headers=headers)
        response.raise_for_status()

        result = response.json()
        if not result or (isinstance(result, list) and len(result) == 0):
            return None

        # Wrap in @graph if returned as a list (expanded JSON-LD)
        if isinstance(result, list):
            return {
                "@context": {
                    "@vocab": "http://example.org/ontology#",
                    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
                    "owl": "http://www.w3.org/2002/07/owl#",
                    "xsd": "http://www.w3.org/2001/XMLSchema#"
                },
                "@graph": result
            }
        return result
    except Exception as e:
        print(f"Error retrieving ontology: {e}")
        return None


def list_user_ontologies(username: str) -> list[dict]:
    """Get list of ontologies for a user."""
    metadata_uri = get_metadata_graph_uri()

    query = f"""
    PREFIX ont: <http://ontology-editor.local/schema#>

    SELECT ?id ?name ?createdAt ?updatedAt
    WHERE {{
        GRAPH <{metadata_uri}> {{
            ?graph a ont:Ontology ;
                   ont:owner "{username}" ;
                   ont:id ?id ;
                   ont:name ?name ;
                   ont:createdAt ?createdAt ;
                   ont:updatedAt ?updatedAt .
        }}
    }}
    ORDER BY DESC(?updatedAt)
    """

    result = execute_sparql_query(query)

    ontologies = []
    for binding in result.get("results", {}).get("bindings", []):
        ontologies.append({
            "id": binding["id"]["value"],
            "name": binding["name"]["value"],
            "owner": username,
            "created_at": binding["createdAt"]["value"],
            "updated_at": binding["updatedAt"]["value"],
        })

    return ontologies


def get_ontology_metadata(username: str, ontology_id: str) -> dict | None:
    """Get metadata for a specific ontology."""
    metadata_uri = get_metadata_graph_uri()
    graph_uri = get_graph_uri(username, ontology_id)

    query = f"""
    PREFIX ont: <http://ontology-editor.local/schema#>

    SELECT ?name ?createdAt ?updatedAt
    WHERE {{
        GRAPH <{metadata_uri}> {{
            <{graph_uri}> a ont:Ontology ;
                   ont:name ?name ;
                   ont:createdAt ?createdAt ;
                   ont:updatedAt ?updatedAt .
        }}
    }}
    """

    result = execute_sparql_query(query)
    bindings = result.get("results", {}).get("bindings", [])

    if not bindings:
        return None

    b = bindings[0]
    return {
        "id": ontology_id,
        "name": b["name"]["value"],
        "owner": username,
        "created_at": b["createdAt"]["value"],
        "updated_at": b["updatedAt"]["value"],
    }


def is_graphdb_available() -> bool:
    """Check if GraphDB is available and the repository exists."""
    try:
        response = requests.get(f"{GRAPHDB_URL}/rest/repositories/{GRAPHDB_REPOSITORY}/size", timeout=2)
        return response.status_code == 200
    except:
        return False


# Knowledge Graph functions

def get_kg_graph_uri(username: str, ontology_id: str, kg_id: str) -> str:
    """Generate a named graph URI for a knowledge graph."""
    return f"http://ontology-editor.local/users/{username}/ontologies/{ontology_id}/kg/{kg_id}"


def create_knowledge_graph(username: str, ontology_id: str, kg_id: str, name: str) -> bool:
    """Create an empty knowledge graph with metadata."""
    kg_uri = get_kg_graph_uri(username, ontology_id, kg_id)
    metadata_uri = get_metadata_graph_uri()
    ontology_uri = get_graph_uri(username, ontology_id)
    now = datetime.utcnow().isoformat()

    update = f"""
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX ont: <http://ontology-editor.local/schema#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

    INSERT DATA {{
        GRAPH <{metadata_uri}> {{
            <{kg_uri}> a ont:KnowledgeGraph ;
                ont:id "{kg_id}" ;
                ont:name "{name}" ;
                ont:belongsTo <{ontology_uri}> ;
                ont:createdAt "{now}"^^xsd:dateTime ;
                ont:updatedAt "{now}"^^xsd:dateTime .
        }}
    }}
    """
    return execute_sparql_update(update)


def list_knowledge_graphs(username: str, ontology_id: str) -> list[dict]:
    """Get list of knowledge graphs for an ontology."""
    metadata_uri = get_metadata_graph_uri()
    ontology_uri = get_graph_uri(username, ontology_id)

    query = f"""
    PREFIX ont: <http://ontology-editor.local/schema#>

    SELECT ?id ?name ?createdAt ?updatedAt
    WHERE {{
        GRAPH <{metadata_uri}> {{
            ?kg a ont:KnowledgeGraph ;
                ont:belongsTo <{ontology_uri}> ;
                ont:id ?id ;
                ont:name ?name ;
                ont:createdAt ?createdAt ;
                ont:updatedAt ?updatedAt .
        }}
    }}
    ORDER BY DESC(?updatedAt)
    """

    result = execute_sparql_query(query)

    kgs = []
    for binding in result.get("results", {}).get("bindings", []):
        kgs.append({
            "id": binding["id"]["value"],
            "name": binding["name"]["value"],
            "created_at": binding["createdAt"]["value"],
            "updated_at": binding["updatedAt"]["value"],
        })

    return kgs


def delete_knowledge_graph(username: str, ontology_id: str, kg_id: str) -> bool:
    """Delete a knowledge graph and its metadata."""
    kg_uri = get_kg_graph_uri(username, ontology_id, kg_id)
    metadata_uri = get_metadata_graph_uri()

    # Delete the graph contents
    try:
        execute_sparql_update(f"DROP GRAPH <{kg_uri}>")
    except:
        pass

    # Delete metadata
    update = f"""
    DELETE WHERE {{
        GRAPH <{metadata_uri}> {{
            <{kg_uri}> ?p ?o .
        }}
    }}
    """
    execute_sparql_update(update)
    return True


def delete_all_knowledge_graphs(username: str, ontology_id: str) -> int:
    """Delete all knowledge graphs for an ontology. Returns count deleted."""
    kgs = list_knowledge_graphs(username, ontology_id)
    for kg in kgs:
        delete_knowledge_graph(username, ontology_id, kg["id"])
    return len(kgs)
