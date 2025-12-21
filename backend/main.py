import json
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, field_validator, ConfigDict
from typing import Annotated

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
    if API_KEY is None:
        # No API key configured - allow access (development mode)
        return True
    if api_key is None or api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True


# Get allowed origins from environment or use defaults
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
GRAPH_FILE = DATA_DIR / "graph.json"


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


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/graph")
async def save_graph(graph: Graph, _: Annotated[bool, Depends(verify_api_key)]):
    if not validate_file_path(GRAPH_FILE):
        raise HTTPException(status_code=500, detail="Invalid file path configuration")
    with open(GRAPH_FILE, "w") as f:
        json.dump(graph.model_dump(), f, indent=2)
    return {"status": "saved", "nodes": len(graph.nodes), "edges": len(graph.edges)}


@app.get("/graph")
async def load_graph(_: Annotated[bool, Depends(verify_api_key)]):
    if not validate_file_path(GRAPH_FILE):
        raise HTTPException(status_code=500, detail="Invalid file path configuration")
    if not GRAPH_FILE.exists():
        return {"nodes": [], "edges": []}
    with open(GRAPH_FILE) as f:
        return json.load(f)
