"""Basic API tests for the Ontology Editor backend."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


class TestHealth:
    """Health check tests."""

    def test_health_endpoint(self):
        """Test that health endpoint returns ok."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestAuth:
    """Authentication tests."""

    def test_login_with_valid_credentials(self):
        """Test login with valid admin credentials."""
        response = client.post(
            "/login",
            json={"username": "admin", "password": "lun2rm0dule"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["username"] == "admin"
        assert data["is_admin"] is True

    def test_login_with_invalid_credentials(self):
        """Test login with invalid credentials."""
        response = client.post(
            "/login",
            json={"username": "admin", "password": "wrongpassword"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False

    def test_login_with_nonexistent_user(self):
        """Test login with non-existent user."""
        response = client.post(
            "/login",
            json={"username": "nonexistent", "password": "password"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False


class TestOntologies:
    """Ontology CRUD tests."""

    def test_list_ontologies(self):
        """Test listing ontologies for a user."""
        response = client.get("/ontologies/admin")
        assert response.status_code == 200
        data = response.json()
        assert "ontologies" in data
        assert isinstance(data["ontologies"], list)

    def test_create_ontology(self):
        """Test creating a new ontology."""
        response = client.post(
            "/ontologies/admin",
            json={"name": "Test Ontology"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "created"
        assert "ontology" in data
        assert data["ontology"]["name"] == "Test Ontology"

        # Clean up - delete the test ontology
        ontology_id = data["ontology"]["id"]
        client.delete(f"/ontologies/admin/{ontology_id}")

    def test_get_ontology(self):
        """Test getting a specific ontology."""
        # First create an ontology
        create_response = client.post(
            "/ontologies/admin",
            json={"name": "Test Get Ontology"}
        )
        ontology_id = create_response.json()["ontology"]["id"]

        # Get the ontology
        response = client.get(f"/ontologies/admin/{ontology_id}")
        assert response.status_code == 200
        data = response.json()
        assert "meta" in data
        assert "graph" in data
        assert data["meta"]["name"] == "Test Get Ontology"

        # Clean up
        client.delete(f"/ontologies/admin/{ontology_id}")

    def test_update_ontology(self):
        """Test updating an ontology."""
        # First create an ontology
        create_response = client.post(
            "/ontologies/admin",
            json={"name": "Test Update Ontology"}
        )
        ontology_id = create_response.json()["ontology"]["id"]

        # Update the ontology
        response = client.put(
            f"/ontologies/admin/{ontology_id}",
            json={
                "id": ontology_id,
                "name": "Updated Ontology",
                "graph": {
                    "nodes": [
                        {
                            "id": "1",
                            "type": "default",
                            "position": {"x": 100, "y": 100},
                            "data": {"label": "TestNode"}
                        }
                    ],
                    "edges": []
                }
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "saved"

        # Clean up
        client.delete(f"/ontologies/admin/{ontology_id}")

    def test_delete_ontology(self):
        """Test deleting an ontology."""
        # First create an ontology
        create_response = client.post(
            "/ontologies/admin",
            json={"name": "Test Delete Ontology"}
        )
        ontology_id = create_response.json()["ontology"]["id"]

        # Delete the ontology
        response = client.delete(f"/ontologies/admin/{ontology_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"

    def test_get_nonexistent_ontology(self):
        """Test getting a non-existent ontology."""
        response = client.get("/ontologies/admin/nonexistent123")
        assert response.status_code == 404


class TestKnowledgeGraphs:
    """Knowledge Graph CRUD tests."""

    @pytest.fixture
    def test_ontology(self):
        """Create a test ontology for knowledge graph tests."""
        response = client.post(
            "/ontologies/admin",
            json={"name": "KG Test Ontology"}
        )
        ontology_id = response.json()["ontology"]["id"]
        yield ontology_id
        # Clean up
        client.delete(f"/ontologies/admin/{ontology_id}")

    def test_list_knowledge_graphs(self, test_ontology):
        """Test listing knowledge graphs for an ontology."""
        response = client.get(f"/knowledge-graphs/admin/{test_ontology}")
        assert response.status_code == 200
        data = response.json()
        assert "knowledge_graphs" in data
        assert isinstance(data["knowledge_graphs"], list)

    def test_create_knowledge_graph(self, test_ontology):
        """Test creating a knowledge graph."""
        response = client.post(
            f"/knowledge-graphs/admin/{test_ontology}",
            json={"name": "Test KG"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "created"
        assert data["knowledge_graph"]["name"] == "Test KG"

    def test_get_knowledge_graph(self, test_ontology):
        """Test getting a specific knowledge graph."""
        # Create a KG
        create_response = client.post(
            f"/knowledge-graphs/admin/{test_ontology}",
            json={"name": "Test Get KG"}
        )
        kg_id = create_response.json()["knowledge_graph"]["id"]

        # Get the KG
        response = client.get(f"/knowledge-graphs/admin/{test_ontology}/{kg_id}")
        assert response.status_code == 200
        data = response.json()
        assert "meta" in data
        assert "data" in data
        assert data["meta"]["name"] == "Test Get KG"

    def test_update_knowledge_graph(self, test_ontology):
        """Test updating a knowledge graph."""
        # Create a KG
        create_response = client.post(
            f"/knowledge-graphs/admin/{test_ontology}",
            json={"name": "Test Update KG"}
        )
        kg_id = create_response.json()["knowledge_graph"]["id"]

        # Update the KG
        response = client.put(
            f"/knowledge-graphs/admin/{test_ontology}/{kg_id}",
            json={
                "id": kg_id,
                "name": "Updated KG",
                "data": {"instances": {"TestClass": ["instance1", "instance2"]}}
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "updated"

    def test_delete_knowledge_graph(self, test_ontology):
        """Test deleting a knowledge graph."""
        # Create a KG
        create_response = client.post(
            f"/knowledge-graphs/admin/{test_ontology}",
            json={"name": "Test Delete KG"}
        )
        kg_id = create_response.json()["knowledge_graph"]["id"]

        # Delete the KG
        response = client.delete(f"/knowledge-graphs/admin/{test_ontology}/{kg_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"


class TestValidation:
    """Input validation tests."""

    def test_create_ontology_empty_name(self):
        """Test that empty ontology name is rejected."""
        response = client.post(
            "/ontologies/admin",
            json={"name": ""}
        )
        assert response.status_code == 422  # Validation error

    def test_create_ontology_name_too_long(self):
        """Test that overly long ontology name is rejected."""
        response = client.post(
            "/ontologies/admin",
            json={"name": "x" * 200}
        )
        assert response.status_code == 422  # Validation error

    def test_login_credentials_too_long(self):
        """Test that overly long credentials are rejected."""
        response = client.post(
            "/login",
            json={"username": "x" * 200, "password": "password"}
        )
        assert response.status_code == 422  # Validation error


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
