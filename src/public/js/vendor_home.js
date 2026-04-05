// Tab switching functionality
function showRequestsTab() {
    document.getElementById('requestsSection').classList.add('active');
    document.getElementById('servicesSection').classList.remove('active');
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.querySelectorAll('.tab-btn')[1].classList.remove('active');
}

function showServicesTab() {
    document.getElementById('requestsSection').classList.remove('active');
    document.getElementById('servicesSection').classList.add('active');
    document.querySelectorAll('.tab-btn')[0].classList.remove('active');
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    loadServices();
}

// Load vendor services
async function loadServices() {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        alert('Please log in to view your services');
        return;
    }

    try {
        const response = await fetch('/services/vendor', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load services');
        }

        const services = await response.json();
        renderServices(services);
    } catch (error) {
        console.error('Error loading services:', error);
        document.getElementById('servicesGrid').innerHTML = '<div class="error">Failed to load services. Please try again.</div>';
    }
}

// Render services
function renderServices(services) {
    const servicesGrid = document.getElementById('servicesGrid');

    if (services.length === 0) {
        servicesGrid.innerHTML = '<div class="no-services">You haven\'t added any services yet. Click "Add New Service" to get started.</div>';
        return;
    }

    const servicesHTML = services.map(service => `
        <div class="service-card">
            <h3>${service.title}</h3>
            <p class="description">${service.description}</p>
            <div class="price">₹${parseInt(service.price).toLocaleString()}</div>
            <div class="city">📍 ${service.city}</div>
            <div class="status ${service.is_active ? 'active' : 'inactive'}">
                ${service.is_active ? 'Active' : 'Inactive'}
            </div>
            
            <!-- MEDIA UPLOAD SECTION -->
            <div style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;">
                <label style="font-size: 13px; color: #666; display:block; margin-bottom:5px;">Upload Service Media (Video/Image):</label>
                <input type="file" id="media-upload-${service.id}" accept="video/*,image/*" style="font-size: 12px; margin-bottom: 5px;">
                <button onclick="uploadServiceMedia('${service.id}')" style="background: #3498db; color: white; border: none; padding: 5px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">Upload</button>
            </div>
        </div>
    `).join('');

    servicesGrid.innerHTML = servicesHTML;
}

// Modal functionality
function showAddServiceModal() {
    document.getElementById('addServiceModal').style.display = 'flex';
}

function closeAddServiceModal() {
    document.getElementById('addServiceModal').style.display = 'none';
    document.getElementById('addServiceForm').reset();
}

// Handle form submission
document.getElementById('addServiceForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const token = localStorage.getItem('accessToken');
    if (!token) {
        alert('Please log in to add services');
        return;
    }

    const formData = {
        title: document.getElementById('serviceTitle').value,
        description: document.getElementById('serviceDescription').value,
        city: document.getElementById('serviceCity').value,
        price: parseInt(document.getElementById('servicePrice').value),
        price_type: document.getElementById('priceType').value
    };

    try {
        const response = await fetch('/services', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error('Failed to add service');
        }

        const result = await response.json();
        alert('Service added successfully!');
        closeAddServiceModal();
        loadServices(); // Refresh the services list
    } catch (error) {
        console.error('Error adding service:', error);
        alert('Failed to add service. Please try again.');
    }
});

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = document.getElementById('addServiceModal');
    if (event.target === modal) {
        closeAddServiceModal();
    }
});

// MEDIA UPLOAD FUNCTIONALITY
async function uploadServiceMedia(serviceId) {
    const fileInput = document.getElementById(`media-upload-${serviceId}`);
    if (!fileInput.files.length) return alert("Please select a file first.");
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
        const token = localStorage.getItem('accessToken') || localStorage.getItem('authToken');
        
        const response = await fetch(`/services/${serviceId}/media`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            alert('Media uploaded successfully!');
            fileInput.value = ""; // clear input
        } else {
            const data = await response.json();
            alert('Failed to upload media: ' + (data.message || 'Error'));
        }
    } catch (err) {
        console.error(err);
        alert('Error uploading media. Please try again.');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Show requests tab by default
    showRequestsTab();
    loadBookingRequests();
});

async function loadBookingRequests() {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
        const response = await fetch('/vendors/booking-requests', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to load requests');

        const requests = await response.json();
        renderRequests(requests);
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('requestCardsContainer').innerHTML = '<div class="error">Failed to load requests.</div>';
    }
}

function renderRequests(requests) {
    const container = document.getElementById('requestCardsContainer');
    
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="no-services" style="grid-column: 1/-1;">No pending booking requests right now.</div>';
        return;
    }

    container.innerHTML = requests.map(req => {
        // If the request isn't pending, maybe different styling or hide it
        const isPending = req.status === 'pending';
        return `
        <div class="vendor-card">
            <div class="vendor-details" style="padding-left: 20px;">
                <h3>Event: ${req.event_title || 'Untitled Event'}</h3>
                <div class="category">Customer: ${req.customer_name}</div>
                
                <div class="description">
                    Booking Date: ${new Date(req.event_start).toLocaleString()}<br>
                    Status: <strong>${req.status.toUpperCase()}</strong>
                </div>

                <div class="vendor-footer">
                    <span class="price">Service: ${req.service_title || 'General'}</span>
                    ${isPending ? `
                    <div class="action-buttons">
                        <button class="accept-btn" onclick="updateRequestStatus('${req.id}', 'accepted')">Accept</button>
                        <button class="reject-btn" onclick="updateRequestStatus('${req.id}', 'rejected')" style="background: #e74c3c; color: white;">Reject</button>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

async function updateRequestStatus(itemId, status) {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
        const response = await fetch(`/vendors/booking-requests/${itemId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });

        if (!response.ok) throw new Error('Failed to update status');

        alert(`Booking request ${status}!`);
        loadBookingRequests(); // reload
    } catch (error) {
        console.error('Error:', error);
        alert('Could not update request status.');
    }
}