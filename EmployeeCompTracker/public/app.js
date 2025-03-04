import * as d3 from 'https://unpkg.com/d3?module';

export async function fetchHierarchy() {
  try {
    const response = await fetch('/get-hierarchy'); // This is your API call to fetch the data
    if (!response.ok) {
      throw new Error('Failed to fetch hierarchy');
    }

    const data = await response.json();  // Parse the response as JSON
    return data;  // Return the fetched hierarchy data
  } catch (error) {
    console.error("Error fetching hierarchy:", error);
    document.getElementById("hierarchyContainer").innerText = 'Error fetching data.';  // Display an error message if fetching fails
  }
}

export function renderInteractiveTree(hierarchyData) {
  // Set dimensions for the tree
  const container = d3.select("#hierarchyContainer");
  const width = container.node().getBoundingClientRect().width;
const height = container.node().getBoundingClientRect().height;

  container.html(''); // Clear any existing tree

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  // Create a D3 hierarchy for the first root node (since we can have multiple root nodes)
  hierarchyData.forEach(rootData => {
    const root = d3.hierarchy(rootData); // Create the hierarchical structure for each root
    const treeLayout = d3.tree().size([height, width])
    .separation((a, b) => {
        return a.parent === b.parent ? 1 : 2;  // Increase separation if needed
      });
    
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

    // Render nodes with rounded square borders
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

    // Create the rounded square borders for nodes
    node.append('rect')
      .attr('width', 120)
      .attr('height', 40)
      .attr('rx', 10)  // Rounded corners
      .attr('ry', 10)
      .style('fill', '#fff')
      .style('stroke', 'steelblue')
      .style('stroke-width', 2);

    // Append text labels inside the rounded square
    node.append('text')
      .attr('dy', 3)
      .attr('x', 60)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text(d => `${d.data.emp_first_name} ${d.data.emp_last_name}`);
  });

  // Define drag event handlers
  function dragStarted(event, d) {
    d3.select(this).raise().select('rect').attr('stroke', 'black');
  }

  function dragged(event, d) {
    d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
  }

  async function dragEnded(event, d) {
    d3.select(this).select('rect').attr('stroke', 'steelblue');
    const newSupervisorData = determineNewSupervisor(d);
    if (newSupervisorData && newSupervisorData.new_sup_id !== d.data.sup_id) {
      await updateSupervisorInDatabase(d.data.emp_id, newSupervisorData);
      initInteractiveTree(); // Reinitialize the tree to reflect the update
    }
  }
}

export function determineNewSupervisor(d) {
  const currentSup = d.data.sup_id || 'None';
  // For this example, we use prompt. In production, replace with a better UI.
  const new_sup_id = prompt(`Enter new supervisor ID for ${d.data.emp_first_name} ${d.data.emp_last_name} (current: ${currentSup}):`, currentSup);
  if (!new_sup_id) return null;
  const new_sup_first_name = prompt("Enter new supervisor's first name:", "");
  const new_sup_last_name = prompt("Enter new supervisor's last name:", "");
  return {
    new_sup_id,
    new_sup_first_name,
    new_sup_last_name
  };
}

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

export async function initInteractiveTree() {
  try {
    const data = await fetchHierarchy();
    console.log("Hierarchy received from server:", data);
    renderInteractiveTree(data); // Pass data directly
  } catch (error) {
    console.error("Error initializing interactive tree:", error);
  }
}
