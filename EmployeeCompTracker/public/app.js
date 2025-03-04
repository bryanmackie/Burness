// app.js

// Import D3 as an ES module from a module-compatible CDN URL
import * as d3 from 'https://unpkg.com/d3?module';

/**
 * Fetch hierarchy data from the Express endpoint.
 * Returns a Promise that resolves to the JSON data.
 */
export async function fetchHierarchyData() {
  try {
    const response = await fetch('/get-hierarchy');
    if (!response.ok) {
      throw new Error('Failed to fetch hierarchy');
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching hierarchy:", error);
    throw error;
  }
}

/**
 * Render an interactive tree from the provided hierarchy data.
 * Builds an SVG tree inside #chartContainer.
 */
export function renderInteractiveTree(hierarchyData) {
  // Set dimensions for the tree
  const width = 800, height = 600;
  const container = d3.select("#chartContainer");
  container.html(''); // Clear any existing tree

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  // Assume hierarchyData is an array with one root element.
  const root = d3.hierarchy(hierarchyData[0]);
  const treeLayout = d3.tree().size([height, width - 160]);
  treeLayout(root);

  // Render links between nodes
  svg.selectAll('path.link')
    .data(root.links())
    .enter()
    .append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .attr('stroke', '#ccc')
    .attr('d', d3.linkHorizontal()
      .x(d => d.y)
      .y(d => d.x));

  // Render nodes
  const node = svg.selectAll('g.node')
    .data(root.descendants())
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.y},${d.x})`)
    .call(d3.drag()
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded)
    );

  // Append circles for nodes
  node.append('circle')
    .attr('r', 10)
    .style('fill', '#fff')
    .style('stroke', 'steelblue');

  // Append text labels for nodes
  node.append('text')
    .attr('dy', 3)
    .attr('x', d => d.children ? -12 : 12)
    .style('text-anchor', d => d.children ? 'end' : 'start')
    .text(d => `${d.data.emp_first_name} ${d.data.emp_last_name}`);

  // Drag event handlers
  function dragStarted(event, d) {
    d3.select(this).raise().select('circle').attr('stroke', 'black');
  }

  function dragged(event, d) {
    d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
  }

  async function dragEnded(event, d) {
    d3.select(this).select('circle').attr('stroke', 'steelblue');
    // Prompt for new supervisor details
    const newSupervisorData = determineNewSupervisor(d);
    if (newSupervisorData && newSupervisorData.new_sup_id !== d.data.sup_id) {
      // Update the database and refresh the tree
      await updateSupervisorInDatabase(d.data.emp_id, newSupervisorData);
      initInteractiveTree(); // Reinitialize the tree to reflect the update
    }
  }
}

/**
 * Prompt the user for a new supervisor.
 * Replace this with a custom UI if desired.
 * Returns an object with new_sup_id, new_sup_first_name, and new_sup_last_name.
 */
export function determineNewSupervisor(d) {
  const currentSup = d.data.sup_id || 'None';
  // For this example, we use prompt. In production, replace with a better UI.
  const new_sup_id = prompt(`Enter new supervisor ID for ${d.data.emp_first_name} ${d.data.emp_last_name} (current: ${currentSup}):`, currentSup);
  if (!new_sup_id) return null;
  // For simplicity, assume supervisor's first and last names are split by the first capital letter or via another mechanism.
  // Here we'll ask the user for them:
  const new_sup_first_name = prompt("Enter new supervisor's first name:", "");
  const new_sup_last_name = prompt("Enter new supervisor's last name:", "");
  return {
    new_sup_id,
    new_sup_first_name,
    new_sup_last_name
  };
}

/**
 * Update the supervisor in the database via the Express endpoint.
 */
export async function updateSupervisorInDatabase(empId, newSupervisorData) {
  try {
    const response = await fetch('/update-supervisor', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        emp_id: empId,
        sup_id: newSupervisorData.new_sup_id,
        sup_first_name: newSupervisorData.new_sup_first_name,
        sup_last_name: newSupervisorData.new_sup_last_name
      })
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message);
    }
    return result;
  } catch (error) {
    console.error('Error updating supervisor in database:', error);
  }
}

/**
 * Initialize the interactive tree:
 * Fetch hierarchy data and render the tree.
 */
export async function initInteractiveTree() {
  try {
    const hierarchyData = await fetchHierarchyData();
    renderInteractiveTree(hierarchyData);
  } catch (error) {
    console.error("Error initializing interactive tree:", error);
    d3.select("#chartContainer").html("<p>Error loading tree.</p>");
  }
}