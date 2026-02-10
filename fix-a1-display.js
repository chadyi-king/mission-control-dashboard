// Debug script to check A1 loading
console.log("Checking A1 project data...");
fetch('data.json')
  .then(r => r.json())
  .then(data => {
    const aProjects = data.projects?.A?.projects || [];
    const a1 = aProjects.find(p => p.id === 'A1');
    console.log("A1 found:", a1 ? "YES" : "NO");
    console.log("A1 tasks:", a1?.tasks?.length || 0);
  });
