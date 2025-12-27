import json
import os
import hashlib
import secrets
from datetime import datetime
from pathlib import Path
from collections import defaultdict
from fastapi import FastAPI, HTTPException, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Annotated
from openai import OpenAI


# Rate limiting for login endpoint
LOGIN_RATE_LIMIT_WINDOW = 300  # 5 minutes
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5  # max attempts per window
login_attempts: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(client_ip: str) -> bool:
    """Check if client has exceeded login rate limit. Returns True if allowed."""
    now = datetime.utcnow().timestamp()
    window_start = now - LOGIN_RATE_LIMIT_WINDOW

    # Clean old attempts
    login_attempts[client_ip] = [
        ts for ts in login_attempts[client_ip] if ts > window_start
    ]

    if len(login_attempts[client_ip]) >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS:
        return False

    return True


def record_login_attempt(client_ip: str) -> None:
    """Record a login attempt for rate limiting."""
    login_attempts[client_ip].append(datetime.utcnow().timestamp())

# Custom exception handlers
app = FastAPI(title="Ontology Editor API")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Sanitize error responses to avoid leaking internal details."""
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions without exposing internals."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


# API Key Authentication
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
API_KEY = os.getenv("API_KEY")


async def verify_api_key(api_key: Annotated[str | None, Depends(API_KEY_HEADER)]):
    """Verify API key if API_KEY environment variable is set."""
    if not API_KEY:
        # No API key configured - allow access (development mode)
        return True
    if api_key is None or api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True


async def verify_admin(x_admin_user: Annotated[str | None, Header()] = None):
    """Verify that the request is from an admin user."""
    if not x_admin_user:
        raise HTTPException(status_code=401, detail="Admin authentication required")

    users = load_users()
    user = users.get(x_admin_user)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid admin user")

    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin privileges required")

    if user.get("archived", False):
        raise HTTPException(status_code=403, detail="Account is archived")

    return x_admin_user


# Get allowed origins from environment or use defaults
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Admin-User"],
)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
USERS_FILE = DATA_DIR / "users.json"
ONTOLOGIES_DIR = DATA_DIR / "ontologies"
ONTOLOGIES_DIR.mkdir(exist_ok=True)


# Password hashing utilities
def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """Hash a password with a salt. Returns (hash, salt)."""
    if salt is None:
        salt = secrets.token_hex(16)
    hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return hash_obj.hex(), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Verify a password against a stored hash."""
    computed_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(computed_hash, stored_hash)


# User management
def load_users() -> dict:
    """Load users from file."""
    if not USERS_FILE.exists():
        return {}
    with open(USERS_FILE) as f:
        return json.load(f)


def save_users(users: dict) -> None:
    """Save users to file."""
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)


def init_default_admin() -> str | None:
    """Initialize default admin user if no users exist. Returns generated password if created."""
    users = load_users()
    if not users:
        # Use fixed password for development
        generated_password = "lun2rm0dule"
        password_hash, salt = hash_password(generated_password)
        users["admin"] = {
            "username": "admin",
            "password_hash": password_hash,
            "salt": salt,
            "is_admin": True,
            "created_at": datetime.utcnow().isoformat(),
        }
        save_users(users)
        return generated_password
    return None


# Initialize default admin on startup
_generated_admin_password = init_default_admin()
if _generated_admin_password:
    print("=" * 60)
    print("INITIAL ADMIN CREDENTIALS (save these, shown only once!):")
    print(f"  Username: admin")
    print(f"  Password: {_generated_admin_password}")
    print("=" * 60)


MAX_LABEL_LENGTH = 200
MAX_ID_LENGTH = 100
MAX_NODES = 1000
MAX_EDGES = 5000


class NodePosition(BaseModel):
    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def validate_coordinate(cls, v: float) -> float:
        if not -1_000_000 <= v <= 1_000_000:
            raise ValueError("Coordinate out of range")
        return v


class NodeData(BaseModel):
    label: str

    @field_validator("label")
    @classmethod
    def validate_label(cls, v: str) -> str:
        if len(v) > MAX_LABEL_LENGTH:
            raise ValueError(f"Label exceeds maximum length of {MAX_LABEL_LENGTH}")
        return v


class Node(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: str | None = "default"
    position: NodePosition
    data: NodeData
    style: dict | None = None

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if len(v) > MAX_ID_LENGTH:
            raise ValueError(f"ID exceeds maximum length of {MAX_ID_LENGTH}")
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str | None) -> str | None:
        if v and len(v) > 50:
            raise ValueError("Type exceeds maximum length of 50")
        return v


class Edge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source: str
    target: str
    label: str | None = None
    animated: bool | None = None
    style: dict | None = None

    @field_validator("id", "source", "target")
    @classmethod
    def validate_edge_ids(cls, v: str) -> str:
        if len(v) > MAX_ID_LENGTH:
            raise ValueError(f"ID exceeds maximum length of {MAX_ID_LENGTH}")
        return v

    @field_validator("label")
    @classmethod
    def validate_edge_label(cls, v: str | None) -> str | None:
        if v and len(v) > MAX_LABEL_LENGTH:
            raise ValueError(f"Label exceeds maximum length of {MAX_LABEL_LENGTH}")
        return v


class Graph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodes: list[Node]
    edges: list[Edge]

    @field_validator("nodes")
    @classmethod
    def validate_nodes_count(cls, v: list[Node]) -> list[Node]:
        if len(v) > MAX_NODES:
            raise ValueError(f"Too many nodes (max {MAX_NODES})")
        return v

    @field_validator("edges")
    @classmethod
    def validate_edges_count(cls, v: list[Edge]) -> list[Edge]:
        if len(v) > MAX_EDGES:
            raise ValueError(f"Too many edges (max {MAX_EDGES})")
        return v


def validate_file_path(file_path: Path) -> bool:
    """Ensure file path is within the allowed DATA_DIR."""
    try:
        resolved = file_path.resolve()
        data_dir_resolved = DATA_DIR.resolve()
        return resolved.is_relative_to(data_dir_resolved)
    except (ValueError, RuntimeError):
        return False


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username", "password")
    @classmethod
    def validate_credentials(cls, v: str) -> str:
        if len(v) > 100:
            raise ValueError("Credential too long")
        return v


class LoginResponse(BaseModel):
    success: bool
    username: str | None = None
    is_admin: bool = False
    message: str | None = None


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, request: Request):
    """Authenticate a user."""
    # Get client IP for rate limiting
    client_ip = request.client.host if request.client else "unknown"

    # Check rate limit
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please try again later."
        )

    # Record this attempt
    record_login_attempt(client_ip)

    users = load_users()
    user = users.get(credentials.username)

    if not user:
        return LoginResponse(success=False, message="Invalid username or password")

    if user.get("archived", False):
        return LoginResponse(success=False, message="Account is archived")

    if not verify_password(credentials.password, user["password_hash"], user["salt"]):
        return LoginResponse(success=False, message="Invalid username or password")

    return LoginResponse(
        success=True,
        username=user["username"],
        is_admin=user.get("is_admin", False)
    )


# User management models and endpoints
class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if len(v) < 1 or len(v) > 50:
            raise ValueError("Username must be 1-50 characters")
        if not v.isalnum() and "_" not in v:
            raise ValueError("Username must be alphanumeric")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 4:
            raise ValueError("Password must be at least 4 characters")
        return v


class UserUpdate(BaseModel):
    password: str | None = None
    is_admin: bool | None = None
    archived: bool | None = None


class UserInfo(BaseModel):
    username: str
    is_admin: bool
    archived: bool
    created_at: str | None = None


def delete_user_ontologies(username: str) -> int:
    """Delete all ontologies and their knowledge graphs for a user. Returns count of deleted ontologies."""
    ontologies = load_user_ontologies(username)
    count = 0

    for ontology in ontologies:
        ontology_id = ontology["id"]
        
        # Delete all knowledge graphs for this ontology
        kgs = load_knowledge_graphs(username, ontology_id)
        for kg in kgs:
            kg_file = get_kg_file(kg["id"])
            if validate_file_path(kg_file) and kg_file.exists():
                kg_file.unlink()
        
        # Delete the knowledge graphs index file
        kg_index_file = get_kg_index_file(username, ontology_id)
        if kg_index_file.exists():
            kg_index_file.unlink()
        
        # Delete the ontology file
        ontology_file = get_ontology_file(ontology_id)
        if validate_file_path(ontology_file) and ontology_file.exists():
            ontology_file.unlink()
            count += 1

    # Delete the index file
    index_file = get_user_ontologies_file(username)
    if index_file.exists():
        index_file.unlink()

    return count


@app.get("/users")
async def list_users(_: Annotated[str, Depends(verify_admin)]):
    """List all users (admin only)."""
    users = load_users()
    user_list = []
    for username, data in users.items():
        user_list.append({
            "username": username,
            "is_admin": data.get("is_admin", False),
            "archived": data.get("archived", False),
            "created_at": data.get("created_at"),
        })
    return {"users": user_list}


@app.post("/users")
async def create_user(data: UserCreate, _: Annotated[str, Depends(verify_admin)]):
    """Create a new user (admin only)."""
    users = load_users()

    if data.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")

    password_hash, salt = hash_password(data.password)
    users[data.username] = {
        "username": data.username,
        "password_hash": password_hash,
        "salt": salt,
        "is_admin": data.is_admin,
        "archived": False,
        "created_at": datetime.utcnow().isoformat(),
    }
    save_users(users)

    # Create default example ontology for the new user
    create_default_ontology_for_user(data.username)

    return {"status": "created", "username": data.username}


@app.put("/users/{username}")
async def update_user(username: str, data: UserUpdate, _: Annotated[str, Depends(verify_admin)]):
    """Update a user (admin only)."""
    users = load_users()

    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")

    if data.password is not None:
        password_hash, salt = hash_password(data.password)
        users[username]["password_hash"] = password_hash
        users[username]["salt"] = salt

    if data.is_admin is not None:
        users[username]["is_admin"] = data.is_admin

    if data.archived is not None:
        users[username]["archived"] = data.archived

    save_users(users)

    return {
        "status": "updated",
        "user": {
            "username": username,
            "is_admin": users[username].get("is_admin", False),
            "archived": users[username].get("archived", False),
        }
    }


@app.delete("/users/{username}")
async def delete_user(username: str, _: Annotated[str, Depends(verify_admin)]):
    """Delete a user and their ontologies (admin only)."""
    users = load_users()

    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")

    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete the admin user")

    # Delete user's ontologies
    deleted_ontologies = delete_user_ontologies(username)

    # Delete user
    del users[username]
    save_users(users)

    return {"status": "deleted", "ontologies_deleted": deleted_ontologies}


# Ontology management models
class OntologyMeta(BaseModel):
    id: str
    name: str
    owner: str
    created_at: str
    updated_at: str


class OntologyCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v) > 100:
            raise ValueError("Name too long")
        if len(v) < 1:
            raise ValueError("Name required")
        return v


class OntologySave(BaseModel):
    id: str
    name: str
    graph: Graph


class KnowledgeGraphCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v) > 100:
            raise ValueError("Name too long")
        if len(v) < 1:
            raise ValueError("Name required")
        return v


class KnowledgeGraphSave(BaseModel):
    id: str
    name: str
    data: dict


def get_user_ontologies_file(username: str) -> Path:
    """Get the path to a user's ontologies index file."""
    return ONTOLOGIES_DIR / f"{username}_index.json"


def get_ontology_file(ontology_id: str) -> Path:
    """Get the path to an ontology data file."""
    # Sanitize ontology_id to prevent path traversal
    safe_id = "".join(c for c in ontology_id if c.isalnum() or c in "-_")
    return ONTOLOGIES_DIR / f"{safe_id}.json"


# Knowledge Graph storage
KNOWLEDGE_GRAPHS_DIR = DATA_DIR / "knowledge_graphs"
KNOWLEDGE_GRAPHS_DIR.mkdir(exist_ok=True)


def get_kg_index_file(username: str, ontology_id: str) -> Path:
    """Get the path to a knowledge graphs index file for a user's ontology."""
    safe_username = "".join(c for c in username if c.isalnum() or c in "-_")
    safe_ontology_id = "".join(c for c in ontology_id if c.isalnum() or c in "-_")
    return KNOWLEDGE_GRAPHS_DIR / f"{safe_username}_{safe_ontology_id}_kg_index.json"


def get_kg_file(kg_id: str) -> Path:
    """Get the path to a knowledge graph data file."""
    safe_id = "".join(c for c in kg_id if c.isalnum() or c in "-_")
    return KNOWLEDGE_GRAPHS_DIR / f"{safe_id}.json"


# JSON-LD conversion functions
def to_jsonld_ontology(internal_format: dict, ontology_name: str = "Ontology") -> dict:
    """Convert internal ontology format (nodes/edges) to JSON-LD."""
    nodes = internal_format.get("nodes", [])
    edges = internal_format.get("edges", [])

    # Build node ID to label mapping
    id_to_label = {}
    for node in nodes:
        label = node.get("data", {}).get("label") or node.get("id")
        id_to_label[node.get("id")] = label

    # Helper to create safe URI
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
        # Store position as custom property for round-trip
        if "position" in node:
            class_entry["_position"] = node["position"]
        if "id" in node:
            class_entry["_nodeId"] = node["id"]
        graph.append(class_entry)

    # Add properties/relationships
    for edge in edges:
        source_label = id_to_label.get(edge.get("source"), edge.get("source"))
        target_label = id_to_label.get(edge.get("target"), edge.get("target"))
        predicate = edge.get("label", "relatedTo")

        if predicate == "subClassOf":
            # Add subClassOf to the class entry
            for entry in graph:
                if entry.get("@id") == to_uri(source_label):
                    entry["rdfs:subClassOf"] = {"@id": to_uri(target_label)}
                    break
        else:
            # Add as object property
            prop_entry = {
                "@id": to_uri(predicate),
                "@type": "owl:ObjectProperty",
                "rdfs:domain": {"@id": to_uri(source_label)},
                "rdfs:range": {"@id": to_uri(target_label)},
                "_edgeId": edge.get("id")
            }
            # Avoid duplicate properties
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


def from_jsonld_ontology(jsonld: dict) -> dict:
    """Convert JSON-LD ontology back to internal format (nodes/edges)."""
    graph = jsonld.get("@graph", [])

    nodes = []
    edges = []
    node_id_counter = 1
    edge_id_counter = 1

    # Maps for reconstructing edges
    uri_to_node_id = {}

    # First pass: create nodes from classes
    for entry in graph:
        entry_type = entry.get("@type")
        if entry_type == "owl:Class":
            uri = entry.get("@id", "")
            label = entry.get("rdfs:label", uri.replace("_", " "))

            # Use stored node ID or generate new one
            node_id = entry.get("_nodeId", str(node_id_counter))
            if not entry.get("_nodeId"):
                node_id_counter += 1

            position = entry.get("_position", {"x": 100, "y": node_id_counter * 100})

            nodes.append({
                "id": node_id,
                "type": "default",
                "position": position,
                "data": {"label": label}
            })
            uri_to_node_id[uri] = node_id

            # Handle subClassOf
            sub_class_of = entry.get("rdfs:subClassOf")
            if sub_class_of:
                target_uri = sub_class_of.get("@id") if isinstance(sub_class_of, dict) else sub_class_of
                edges.append({
                    "_source_uri": uri,
                    "_target_uri": target_uri,
                    "label": "subClassOf"
                })

    # Second pass: create edges from object properties
    for entry in graph:
        entry_type = entry.get("@type")
        if entry_type == "owl:ObjectProperty":
            predicate = entry.get("@id", "relatedTo").replace("_", " ")
            domain = entry.get("rdfs:domain", {})
            range_val = entry.get("rdfs:range", {})

            source_uri = domain.get("@id") if isinstance(domain, dict) else domain
            target_uri = range_val.get("@id") if isinstance(range_val, dict) else range_val

            edge_id = entry.get("_edgeId", f"edge-{edge_id_counter}")
            if not entry.get("_edgeId"):
                edge_id_counter += 1

            edges.append({
                "_source_uri": source_uri,
                "_target_uri": target_uri,
                "label": predicate,
                "id": edge_id
            })

    # Resolve edge URIs to node IDs
    resolved_edges = []
    for edge in edges:
        source_uri = edge.get("_source_uri")
        target_uri = edge.get("_target_uri")
        source_id = uri_to_node_id.get(source_uri)
        target_id = uri_to_node_id.get(target_uri)

        if source_id and target_id:
            resolved_edges.append({
                "id": edge.get("id", f"edge-{len(resolved_edges) + 1}"),
                "source": source_id,
                "target": target_id,
                "label": edge.get("label", "relatedTo")
            })

    return {"nodes": nodes, "edges": resolved_edges}


def to_jsonld_kg(internal_format: dict, ontology_graph: dict = None) -> dict:
    """Convert internal knowledge graph format to JSON-LD."""
    instances = internal_format.get("instances", {})
    relationships = internal_format.get("relationships", {})

    def to_uri(label: str) -> str:
        return label.replace(" ", "_")

    graph = []

    # Create instance entries
    instance_uris = {}  # Maps class:instance to URI
    for class_name, instance_list in instances.items():
        for instance_name in instance_list:
            uri = f"instance:{to_uri(instance_name)}"
            instance_uris[f"{class_name}:{instance_name}"] = uri

            entry = {
                "@id": uri,
                "@type": to_uri(class_name),
                "rdfs:label": instance_name
            }
            graph.append(entry)

    # Add relationships to instances
    for rel_key, rel_values in relationships.items():
        # Parse relationship key: "SourceClass:predicate:TargetClass"
        parts = rel_key.split(":")
        if len(parts) != 3:
            continue
        source_class, predicate, target_class = parts

        # For each source instance, add the relationship
        source_instances = instances.get(source_class, [])
        for source_instance in source_instances:
            source_uri = f"instance:{to_uri(source_instance)}"

            # Find the graph entry for this source instance
            for entry in graph:
                if entry.get("@id") == source_uri:
                    # Add the predicate with target instances
                    targets = []
                    for target_instance in rel_values:
                        if target_instance in instances.get(target_class, []):
                            targets.append({"@id": f"instance:{to_uri(target_instance)}"})
                    if targets:
                        entry[to_uri(predicate)] = targets if len(targets) > 1 else targets[0]
                    break

    return {
        "@context": {
            "@vocab": "http://example.org/ontology#",
            "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            "instance": "http://example.org/instance/"
        },
        "@graph": graph
    }


def from_jsonld_kg(jsonld: dict) -> dict:
    """Convert JSON-LD knowledge graph back to internal format."""
    graph = jsonld.get("@graph", [])

    instances = {}
    relationships = {}

    # First pass: extract instances
    uri_to_info = {}  # Maps URI to (class, instance_name)
    for entry in graph:
        uri = entry.get("@id", "")
        class_type = entry.get("@type", "").replace("_", " ")
        label = entry.get("rdfs:label", uri.split(":")[-1].replace("_", " "))

        if class_type:
            if class_type not in instances:
                instances[class_type] = []
            if label not in instances[class_type]:
                instances[class_type].append(label)
            uri_to_info[uri] = (class_type, label)

    # Second pass: extract relationships
    for entry in graph:
        source_uri = entry.get("@id", "")
        source_info = uri_to_info.get(source_uri)
        if not source_info:
            continue
        source_class, source_instance = source_info

        for key, value in entry.items():
            if key.startswith("@") or key.startswith("rdfs:"):
                continue

            predicate = key.replace("_", " ")
            targets = value if isinstance(value, list) else [value]

            for target in targets:
                if isinstance(target, dict):
                    target_uri = target.get("@id", "")
                    target_info = uri_to_info.get(target_uri)
                    if target_info:
                        target_class, target_instance = target_info
                        rel_key = f"{source_class}:{predicate}:{target_class}"
                        if rel_key not in relationships:
                            relationships[rel_key] = []
                        if target_instance not in relationships[rel_key]:
                            relationships[rel_key].append(target_instance)

    return {"instances": instances, "relationships": relationships}


def load_knowledge_graphs(username: str, ontology_id: str) -> list[dict]:
    """Load list of knowledge graphs for a user's ontology."""
    index_file = get_kg_index_file(username, ontology_id)
    if not index_file.exists():
        return []
    with open(index_file) as f:
        return json.load(f)


def save_knowledge_graphs_index(username: str, ontology_id: str, kgs: list[dict]) -> None:
    """Save list of knowledge graphs for a user's ontology."""
    index_file = get_kg_index_file(username, ontology_id)
    with open(index_file, "w") as f:
        json.dump(kgs, f, indent=2)


def load_user_ontologies(username: str) -> list[dict]:
    """Load list of ontologies for a user."""
    index_file = get_user_ontologies_file(username)
    if not index_file.exists():
        return []
    with open(index_file) as f:
        return json.load(f)


def save_user_ontologies(username: str, ontologies: list[dict]) -> None:
    """Save list of ontologies for a user."""
    index_file = get_user_ontologies_file(username)
    with open(index_file, "w") as f:
        json.dump(ontologies, f, indent=2)


def get_default_sandwich_ontology_graph() -> dict:
    """Generate the default sandwich ontology graph based on JSON-LD schema."""
    # Node style
    class_style = {"background": "#6366f1", "color": "white", "border": "none"}
    parent_style = {"background": "#94a3b8", "color": "white", "border": "none"}

    nodes = [
        # Parent classes (schema.org)
        {"id": "1", "type": "default", "position": {"x": 400, "y": 0}, "data": {"label": "MenuItem"}, "style": parent_style},
        {"id": "2", "type": "default", "position": {"x": 100, "y": 0}, "data": {"label": "Food"}, "style": parent_style},
        {"id": "3", "type": "default", "position": {"x": 250, "y": 0}, "data": {"label": "Seasoning"}, "style": parent_style},
        {"id": "4", "type": "default", "position": {"x": 550, "y": 0}, "data": {"label": "HowToStep"}, "style": parent_style},

        # Main ontology classes
        {"id": "5", "type": "default", "position": {"x": 300, "y": 150}, "data": {"label": "Sandwich"}, "style": class_style},
        {"id": "6", "type": "default", "position": {"x": 50, "y": 150}, "data": {"label": "Bread"}, "style": class_style},
        {"id": "7", "type": "default", "position": {"x": 150, "y": 250}, "data": {"label": "Filling"}, "style": class_style},
        {"id": "8", "type": "default", "position": {"x": 250, "y": 350}, "data": {"label": "Condiment"}, "style": class_style},
        {"id": "9", "type": "default", "position": {"x": 500, "y": 150}, "data": {"label": "PreparationStep"}, "style": class_style},
    ]

    edges = [
        # subClassOf relationships
        {"id": "e1", "source": "5", "target": "1", "label": "subClassOf"},
        {"id": "e2", "source": "6", "target": "2", "label": "subClassOf"},
        {"id": "e3", "source": "7", "target": "2", "label": "subClassOf"},
        {"id": "e4", "source": "8", "target": "3", "label": "subClassOf"},
        {"id": "e5", "source": "9", "target": "4", "label": "subClassOf"},

        # Object property relationships
        {"id": "e6", "source": "5", "target": "6", "label": "usesBread"},
        {"id": "e7", "source": "5", "target": "7", "label": "hasFilling"},
        {"id": "e8", "source": "5", "target": "8", "label": "includesCondiment"},
        {"id": "e9", "source": "5", "target": "9", "label": "hasPreparationStep"},
        {"id": "e10", "source": "5", "target": "1", "label": "pairedWith"},
    ]

    return {"nodes": nodes, "edges": edges}


def create_default_ontology_for_user(username: str) -> dict:
    """Create the default Sandwich Ontology example for a new user."""
    ontology_id = secrets.token_hex(8)
    now = datetime.utcnow().isoformat()

    # Create ontology metadata
    meta = {
        "id": ontology_id,
        "name": "Sandwich Ontology (Example)",
        "owner": username,
        "created_at": now,
        "updated_at": now,
    }

    # Save the graph
    ontology_file = get_ontology_file(ontology_id)
    if validate_file_path(ontology_file):
        graph = get_default_sandwich_ontology_graph()
        with open(ontology_file, "w") as f:
            json.dump(graph, f, indent=2)

    # Add to user's index
    ontologies = load_user_ontologies(username)
    ontologies.append(meta)
    save_user_ontologies(username, ontologies)

    return meta


@app.get("/ontologies/{username}")
async def list_ontologies(username: str, _: Annotated[bool, Depends(verify_api_key)]):
    """List all ontologies for a user."""
    ontologies = load_user_ontologies(username)

    # Create default example ontology if user doesn't have it yet
    has_example = any("(Example)" in o.get("name", "") for o in ontologies)
    if not has_example:
        create_default_ontology_for_user(username)
        ontologies = load_user_ontologies(username)

    return {"ontologies": ontologies}


@app.post("/ontologies/{username}")
async def create_ontology(username: str, data: OntologyCreate, _: Annotated[bool, Depends(verify_api_key)]):
    """Create a new ontology for a user."""
    ontology_id = secrets.token_hex(8)
    now = datetime.utcnow().isoformat()

    # Create ontology metadata
    meta = {
        "id": ontology_id,
        "name": data.name,
        "owner": username,
        "created_at": now,
        "updated_at": now,
    }

    # Save empty graph
    ontology_file = get_ontology_file(ontology_id)
    if not validate_file_path(ontology_file):
        raise HTTPException(status_code=500, detail="Invalid file path")

    with open(ontology_file, "w") as f:
        json.dump({"nodes": [], "edges": []}, f, indent=2)

    # Add to user's index
    ontologies = load_user_ontologies(username)
    ontologies.append(meta)
    save_user_ontologies(username, ontologies)

    return {"status": "created", "ontology": meta}


class OntologyImport(BaseModel):
    """Model for importing an ontology from JSON-LD."""
    name: str = Field(..., min_length=1, max_length=200)
    jsonld: dict


def validate_jsonld(data: dict) -> tuple[bool, str]:
    """Validate that the data is a valid JSON-LD document."""
    # Check for @context (required for JSON-LD)
    if "@context" not in data:
        return False, "Missing @context - not a valid JSON-LD document"

    # Check @context is valid type
    context = data["@context"]
    if not isinstance(context, (str, dict, list)):
        return False, "@context must be a string, object, or array"

    return True, ""


def convert_jsonld_to_graph(jsonld: dict) -> dict:
    """Convert a JSON-LD ontology to graph nodes and edges."""
    nodes = []
    edges = []
    node_id_counter = 1
    entity_to_node_id = {}

    # Node styles
    class_style = {"background": "#6366f1", "color": "white", "border": "none"}
    parent_style = {"background": "#94a3b8", "color": "white", "border": "none"}

    # Layout configuration
    x_spacing = 180
    y_spacing = 120

    # Extract entities (classes)
    entities = jsonld.get("aiia:entities", [])
    if not entities and "@graph" in jsonld:
        # Try to extract from @graph
        entities = [item for item in jsonld["@graph"] if item.get("@type") == "owl:Class"]

    # Collect parent classes referenced in subClassOf
    parent_classes = set()
    for entity in entities:
        sub_class_of = entity.get("rdfs:subClassOf", {})
        if isinstance(sub_class_of, dict):
            parent_id = sub_class_of.get("@id", "")
            if parent_id and not parent_id.startswith("aiia:"):
                parent_classes.add(parent_id)
        elif isinstance(sub_class_of, str):
            if not sub_class_of.startswith("aiia:"):
                parent_classes.add(sub_class_of)

    # Create nodes for parent classes (top row)
    x_pos = 50
    for parent in sorted(parent_classes):
        node_id = str(node_id_counter)
        entity_to_node_id[parent] = node_id
        nodes.append({
            "id": node_id,
            "type": "default",
            "position": {"x": x_pos, "y": 0},
            "data": {"label": parent},
            "style": parent_style
        })
        node_id_counter += 1
        x_pos += x_spacing

    # Create nodes for main entities (second row)
    x_pos = 50
    for entity in entities:
        entity_id = entity.get("@id", "")
        label = entity.get("rdfs:label", entity_id.replace("aiia:", ""))

        node_id = str(node_id_counter)
        entity_to_node_id[entity_id] = node_id
        nodes.append({
            "id": node_id,
            "type": "default",
            "position": {"x": x_pos, "y": y_spacing},
            "data": {"label": label},
            "style": class_style
        })
        node_id_counter += 1
        x_pos += x_spacing

    # Create edges for subClassOf relationships
    edge_id_counter = 1
    for entity in entities:
        entity_id = entity.get("@id", "")
        source_node_id = entity_to_node_id.get(entity_id)
        if not source_node_id:
            continue

        sub_class_of = entity.get("rdfs:subClassOf", {})
        parent_id = None
        if isinstance(sub_class_of, dict):
            parent_id = sub_class_of.get("@id")
        elif isinstance(sub_class_of, str):
            parent_id = sub_class_of

        if parent_id and parent_id in entity_to_node_id:
            edges.append({
                "id": f"e{edge_id_counter}",
                "source": source_node_id,
                "target": entity_to_node_id[parent_id],
                "label": "subClassOf"
            })
            edge_id_counter += 1

    # Create edges for relationships (object properties)
    relationships = jsonld.get("aiia:relationships", [])
    for rel in relationships:
        rel_label = rel.get("rdfs:label", rel.get("@id", "").replace("aiia:", ""))
        domain = rel.get("domain", "")
        range_val = rel.get("range", "")

        # Get node IDs for domain and range
        source_node_id = entity_to_node_id.get(domain)
        target_node_id = entity_to_node_id.get(range_val)

        if source_node_id and target_node_id:
            edges.append({
                "id": f"e{edge_id_counter}",
                "source": source_node_id,
                "target": target_node_id,
                "label": rel_label
            })
            edge_id_counter += 1

    return {"nodes": nodes, "edges": edges}


@app.post("/ontologies/{username}/import")
async def import_ontology(username: str, data: OntologyImport, _: Annotated[bool, Depends(verify_api_key)]):
    """Import an ontology from JSON-LD format."""
    # Validate JSON-LD
    is_valid, error_msg = validate_jsonld(data.jsonld)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    ontology_id = secrets.token_hex(8)
    now = datetime.utcnow().isoformat()

    # Create ontology metadata
    meta = {
        "id": ontology_id,
        "name": data.name,
        "owner": username,
        "created_at": now,
        "updated_at": now,
    }

    # Convert JSON-LD to graph format
    graph = convert_jsonld_to_graph(data.jsonld)

    # Save graph
    ontology_file = get_ontology_file(ontology_id)
    if not validate_file_path(ontology_file):
        raise HTTPException(status_code=500, detail="Invalid file path")

    with open(ontology_file, "w") as f:
        json.dump(graph, f, indent=2)

    # Add to user's index
    ontologies = load_user_ontologies(username)
    ontologies.append(meta)
    save_user_ontologies(username, ontologies)

    return {"status": "created", "ontology": meta}


@app.get("/ontologies/{username}/{ontology_id}")
async def load_ontology(username: str, ontology_id: str, _: Annotated[bool, Depends(verify_api_key)]):
    """Load an ontology."""
    # Verify ownership
    ontologies = load_user_ontologies(username)
    meta = next((o for o in ontologies if o["id"] == ontology_id), None)
    if not meta:
        raise HTTPException(status_code=404, detail="Ontology not found")

    ontology_file = get_ontology_file(ontology_id)
    if not validate_file_path(ontology_file):
        raise HTTPException(status_code=500, detail="Invalid file path")

    if not ontology_file.exists():
        return {"meta": meta, "graph": {"nodes": [], "edges": []}}

    with open(ontology_file) as f:
        stored_data = json.load(f)

    # Check if stored as JSON-LD or legacy format
    if "@context" in stored_data and "@graph" in stored_data:
        # JSON-LD format - convert to internal format for frontend
        graph = from_jsonld_ontology(stored_data)
    else:
        # Legacy format - use as-is
        graph = stored_data

    return {"meta": meta, "graph": graph}


@app.put("/ontologies/{username}/{ontology_id}")
async def save_ontology(username: str, ontology_id: str, data: OntologySave, _: Annotated[bool, Depends(verify_api_key)]):
    """Save an ontology."""
    # Verify ownership
    ontologies = load_user_ontologies(username)
    meta_idx = next((i for i, o in enumerate(ontologies) if o["id"] == ontology_id), None)
    if meta_idx is None:
        raise HTTPException(status_code=404, detail="Ontology not found")

    ontology_file = get_ontology_file(ontology_id)
    if not validate_file_path(ontology_file):
        raise HTTPException(status_code=500, detail="Invalid file path")

    # Convert to JSON-LD format for storage
    internal_format = data.graph.model_dump()
    jsonld_format = to_jsonld_ontology(internal_format, data.name)

    # Save as JSON-LD
    with open(ontology_file, "w") as f:
        json.dump(jsonld_format, f, indent=2)

    # Update metadata
    ontologies[meta_idx]["name"] = data.name
    ontologies[meta_idx]["updated_at"] = datetime.utcnow().isoformat()
    save_user_ontologies(username, ontologies)

    return {"status": "saved", "ontology": ontologies[meta_idx]}


@app.delete("/ontologies/{username}/{ontology_id}")
async def delete_ontology(username: str, ontology_id: str, _: Annotated[bool, Depends(verify_api_key)]):
    """Delete an ontology and all its knowledge graphs."""
    # Verify ownership
    ontologies = load_user_ontologies(username)
    meta_idx = next((i for i, o in enumerate(ontologies) if o["id"] == ontology_id), None)
    if meta_idx is None:
        raise HTTPException(status_code=404, detail="Ontology not found")

    # Delete all knowledge graphs for this ontology
    kgs = load_knowledge_graphs(username, ontology_id)
    for kg in kgs:
        kg_file = get_kg_file(kg["id"])
        if validate_file_path(kg_file) and kg_file.exists():
            kg_file.unlink()
    
    # Delete the knowledge graphs index file
    kg_index_file = get_kg_index_file(username, ontology_id)
    if kg_index_file.exists():
        kg_index_file.unlink()

    ontology_file = get_ontology_file(ontology_id)
    if validate_file_path(ontology_file) and ontology_file.exists():
        ontology_file.unlink()

    # Remove from index
    ontologies.pop(meta_idx)
    save_user_ontologies(username, ontologies)

    return {"status": "deleted", "knowledge_graphs_deleted": len(kgs)}


def verify_ontology_ownership(username: str, ontology_id: str) -> bool:
    """Verify that a user owns an ontology. Returns True if owned."""
    ontologies = load_user_ontologies(username)
    return any(o["id"] == ontology_id for o in ontologies)


# Knowledge Graph API models
class KnowledgeGraphMeta(BaseModel):
    id: str
    name: str
    owner: str
    ontology_id: str
    created_at: str
    updated_at: str


@app.get("/knowledge-graphs/{username}/{ontology_id}")
async def list_knowledge_graphs(username: str, ontology_id: str, _: Annotated[bool, Depends(verify_api_key)]):
    """List all knowledge graphs for a user's ontology."""
    # Verify ownership
    if not verify_ontology_ownership(username, ontology_id):
        raise HTTPException(status_code=404, detail="Ontology not found")
    
    kgs = load_knowledge_graphs(username, ontology_id)
    return {"knowledge_graphs": kgs}


@app.post("/knowledge-graphs/{username}/{ontology_id}")
async def create_knowledge_graph(username: str, ontology_id: str, data: KnowledgeGraphCreate, _: Annotated[bool, Depends(verify_api_key)]):
    """Create a new knowledge graph for a user's ontology."""
    # Verify ownership
    if not verify_ontology_ownership(username, ontology_id):
        raise HTTPException(status_code=404, detail="Ontology not found")
    
    kg_id = secrets.token_hex(8)
    now = datetime.utcnow().isoformat()
    
    # Create knowledge graph metadata
    meta = {
        "id": kg_id,
        "name": data.name,
        "owner": username,
        "ontology_id": ontology_id,
        "created_at": now,
        "updated_at": now,
    }
    
    # Save empty data
    kg_file = get_kg_file(kg_id)
    if not validate_file_path(kg_file):
        raise HTTPException(status_code=500, detail="Invalid file path")
    
    with open(kg_file, "w") as f:
        json.dump({}, f, indent=2)
    
    # Add to index
    kgs = load_knowledge_graphs(username, ontology_id)
    kgs.append(meta)
    save_knowledge_graphs_index(username, ontology_id, kgs)
    
    return {"status": "created", "knowledge_graph": meta}


@app.get("/knowledge-graphs/{username}/{ontology_id}/{kg_id}")
async def get_knowledge_graph(username: str, ontology_id: str, kg_id: str, _: Annotated[bool, Depends(verify_api_key)]):
    """Get a specific knowledge graph."""
    # Verify ownership
    if not verify_ontology_ownership(username, ontology_id):
        raise HTTPException(status_code=404, detail="Ontology not found")

    # Verify knowledge graph exists and belongs to this ontology
    kgs = load_knowledge_graphs(username, ontology_id)
    meta = next((kg for kg in kgs if kg["id"] == kg_id), None)
    if not meta:
        raise HTTPException(status_code=404, detail="Knowledge graph not found")

    # Load the knowledge graph data
    kg_file = get_kg_file(kg_id)
    if not validate_file_path(kg_file):
        raise HTTPException(status_code=500, detail="Invalid file path")

    if not kg_file.exists():
        return {"meta": meta, "data": {"instances": {}, "relationships": {}}}

    with open(kg_file) as f:
        stored_data = json.load(f)

    # Check if stored as JSON-LD or legacy format
    if "@context" in stored_data and "@graph" in stored_data:
        # JSON-LD format - convert to internal format for frontend
        kg_data = from_jsonld_kg(stored_data)
    else:
        # Legacy format - use as-is
        kg_data = stored_data

    return {"meta": meta, "data": kg_data}


@app.put("/knowledge-graphs/{username}/{ontology_id}/{kg_id}")
async def update_knowledge_graph(username: str, ontology_id: str, kg_id: str, data: KnowledgeGraphSave, _: Annotated[bool, Depends(verify_api_key)]):
    """Update a knowledge graph."""
    # Verify ownership
    if not verify_ontology_ownership(username, ontology_id):
        raise HTTPException(status_code=404, detail="Ontology not found")

    # Verify knowledge graph exists and belongs to this ontology
    kgs = load_knowledge_graphs(username, ontology_id)
    meta_idx = next((i for i, kg in enumerate(kgs) if kg["id"] == kg_id), None)
    if meta_idx is None:
        raise HTTPException(status_code=404, detail="Knowledge graph not found")

    # Verify the IDs match
    if data.id != kg_id:
        raise HTTPException(status_code=400, detail="Knowledge graph ID mismatch")

    # Save knowledge graph data
    kg_file = get_kg_file(kg_id)
    if not validate_file_path(kg_file):
        raise HTTPException(status_code=500, detail="Invalid file path")

    # Convert to JSON-LD format for storage
    jsonld_format = to_jsonld_kg(data.data)

    with open(kg_file, "w") as f:
        json.dump(jsonld_format, f, indent=2)

    # Update metadata
    kgs[meta_idx]["name"] = data.name
    kgs[meta_idx]["updated_at"] = datetime.utcnow().isoformat()
    save_knowledge_graphs_index(username, ontology_id, kgs)
    
    return {"status": "updated", "knowledge_graph": kgs[meta_idx]}


@app.delete("/knowledge-graphs/{username}/{ontology_id}/{kg_id}")
async def delete_knowledge_graph(username: str, ontology_id: str, kg_id: str, _: Annotated[bool, Depends(verify_api_key)]):
    """Delete a knowledge graph."""
    # Verify ownership
    if not verify_ontology_ownership(username, ontology_id):
        raise HTTPException(status_code=404, detail="Ontology not found")
    
    # Verify knowledge graph exists and belongs to this ontology
    kgs = load_knowledge_graphs(username, ontology_id)
    meta_idx = next((i for i, kg in enumerate(kgs) if kg["id"] == kg_id), None)
    if meta_idx is None:
        raise HTTPException(status_code=404, detail="Knowledge graph not found")
    
    # Delete the data file
    kg_file = get_kg_file(kg_id)
    if validate_file_path(kg_file) and kg_file.exists():
        kg_file.unlink()
    
    # Remove from index
    kgs.pop(meta_idx)
    save_knowledge_graphs_index(username, ontology_id, kgs)
    
    return {"status": "deleted"}


# Chat endpoint for ontology assistant
class ChatMessageInput(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("user", "assistant", "system"):
            raise ValueError("Invalid role")
        return v

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        if len(v) > 50000:
            raise ValueError("Message too long")
        return v


class ChatRequest(BaseModel):
    messages: list[ChatMessageInput]

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, v: list[ChatMessageInput]) -> list[ChatMessageInput]:
        if len(v) > 50:
            raise ValueError("Too many messages")
        return v


class ChatResponse(BaseModel):
    content: str


# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, _: Annotated[bool, Depends(verify_api_key)]):
    """Send a chat message to the ontology assistant."""
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured. Set OPENAI_API_KEY environment variable."
        )

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
            temperature=0.7,
            max_tokens=1000,
        )
        content = response.choices[0].message.content or ""
        return ChatResponse(content=content)
    except Exception as e:
        # Log error but don't expose details
        print(f"OpenAI API error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Failed to get response from AI service"
        )
