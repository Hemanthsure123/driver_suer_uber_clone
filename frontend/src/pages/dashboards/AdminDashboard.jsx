import { useEffect, useState } from "react";
import axios from "../../api/axios";

export default function AdminDashboard() {
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [allDrivers, setAllDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const [pendingRes, allRes] = await Promise.all([
        axios.get("/admin/drivers/pending", { headers: { Authorization: `Bearer ${token}` } }),
        axios.get("/admin/drivers", { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setPendingDrivers(pendingRes.data);
      setAllDrivers(allRes.data);
    } catch (error) {
      console.error("Error fetching drivers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await axios.patch(`/admin/driver/${id}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDrivers(); // Refresh list
    } catch (error) {
      console.error("Error approving driver:", error);
    }
  };

  const handleReject = async (id) => {
    if (!confirm("Are you sure you want to reject this driver?")) return;
    try {
      await axios.patch(`/admin/driver/${id}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDrivers(); // Refresh list
    } catch (error) {
      console.error("Error rejecting driver:", error);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Admin Dashboard</h1>

      <section style={styles.section}>
        <h2 style={styles.subHeader}>Pending Approvals ({pendingDrivers.length})</h2>
        {pendingDrivers.length === 0 ? (
          <p>No pending approvals.</p>
        ) : (
          <div style={styles.grid}>
            {pendingDrivers.map((d) => (
              <div key={d._id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <img
                    src={d.selfieUrl || "https://via.placeholder.com/100"}
                    alt="Selfie"
                    style={styles.avatar}
                  />
                  <div>
                    <h3 style={styles.name}>{d.fullName}</h3>
                    <p style={styles.email}>{d.userId?.email}</p>
                  </div>
                </div>
                <div style={styles.details}>
                  <p><strong>License:</strong> {d.licenseNumber}</p>
                  <p><strong>Vehicle:</strong> {d.vehicle?.brand} {d.vehicle?.model} ({d.vehicle?.category})</p>
                  <p><strong>Plate:</strong> {d.vehicle?.rcNumber}</p>
                </div>
                <div style={styles.actions}>
                  <button onClick={() => handleApprove(d._id)} style={styles.btnApprove}>Approve</button>
                  <button onClick={() => handleReject(d._id)} style={styles.btnReject}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.subHeader}>All Drivers ({allDrivers.length})</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Vehicle</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {allDrivers.map((d) => (
              <tr key={d._id}>
                <td style={styles.td}>{d.fullName}</td>
                <td style={styles.td}>{d.userId?.email}</td>
                <td style={styles.td}>{d.vehicle?.brand} {d.vehicle?.model}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.badge, ...getStatusStyle(d.adminStatus) }}>
                    {d.adminStatus}
                  </span>
                </td>
                <td style={styles.td}>{new Date(d.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const getStatusStyle = (status) => {
  switch (status) {
    case "APPROVED": return { backgroundColor: "#d4edda", color: "#155724" };
    case "REJECTED": return { backgroundColor: "#f8d7da", color: "#721c24" };
    case "PENDING": return { backgroundColor: "#fff3cd", color: "#856404" };
    default: return { backgroundColor: "#e2e3e5", color: "#383d41" };
  }
};

const styles = {
  container: {
    padding: "20px",
    maxWidth: "1200px",
    margin: "0 auto",
    width: "100%",
    color: "#333",
    backgroundColor: "#fff", // Valid for dashboard
    minHeight: "100vh"
  },
  header: {
    textAlign: "center",
    marginBottom: "30px",
    color: "#2c3e50"
  },
  section: {
    marginBottom: "40px"
  },
  subHeader: {
    borderBottom: "2px solid #eee",
    paddingBottom: "10px",
    marginBottom: "20px",
    color: "#34495e"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "20px"
  },
  card: {
    border: "1px solid #e0e0e0",
    borderRadius: "10px",
    padding: "15px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
    backgroundColor: "#fff"
  },
  cardHeader: {
    display: "flex",
    gap: "15px",
    alignItems: "center",
    marginBottom: "15px"
  },
  avatar: {
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid #ddd"
  },
  name: {
    margin: "0 0 5px 0",
    fontSize: "1.1em"
  },
  email: {
    margin: 0,
    color: "#666",
    fontSize: "0.9em"
  },
  details: {
    fontSize: "0.9em",
    lineHeight: "1.6",
    marginBottom: "15px",
    color: "#555"
  },
  actions: {
    display: "flex",
    gap: "10px"
  },
  btnApprove: {
    flex: 1,
    backgroundColor: "#27ae60",
    color: "#fff",
    border: "none",
    padding: "10px",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold"
  },
  btnReject: {
    flex: 1,
    backgroundColor: "#e74c3c",
    color: "#fff",
    border: "none",
    padding: "10px",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "10px"
  },
  th: {
    textAlign: "left",
    padding: "12px",
    backgroundColor: "#f8f9fa",
    borderBottom: "2px solid #dee2e6",
    color: "#495057"
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #dee2e6",
    color: "#212529"
  },
  badge: {
    padding: "5px 10px",
    borderRadius: "15px",
    fontSize: "0.85em",
    fontWeight: "bold",
    display: "inline-block"
  }
};
