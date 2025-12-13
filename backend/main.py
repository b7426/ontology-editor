import json
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Ontology Editor API")

# Get allowed origins from environment or use defaults
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
GRAPH_FILE = DATA_DIR / "graph.json"


class NodePosition(BaseModel):
    x: float
    y: float


class NodeData(BaseModel):
    label: str


class Node(BaseModel):
    id: str
    type: str | None = "default"
    position: NodePosition
    data: NodeData
    style: dict | None = None


class Edge(BaseModel):
    id: str
    source: str
    target: str
    label: str | None = None
    animated: bool | None = None
    style: dict | None = None


class Graph(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/graph")
async def save_graph(graph: Graph):
    with open(GRAPH_FILE, "w") as f:
        json.dump(graph.model_dump(), f, indent=2)
    return {"status": "saved", "nodes": len(graph.nodes), "edges": len(graph.edges)}


@app.get("/graph")
async def load_graph():
    if not GRAPH_FILE.exists():
        return {"nodes": [], "edges": []}
    with open(GRAPH_FILE) as f:
        return json.load(f)
