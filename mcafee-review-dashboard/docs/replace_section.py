import re

# Read the original file
with open('index.html', 'r') as f:
    content = f.read()

# Read the new insights section
with open('/tmp/insights_section.html', 'r') as f:
    new_section = f.read()

# Find the start and end of the Analysis section
start_marker = '<!-- ======== Analysis Tab'
end_marker = '</section>\n\n  </main>'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    # Find the closing section tag before </main>
    # We need to find the </section> that closes tab-analysis
    section_end = content.rfind('</section>', 0, end_idx)
    
    if section_end != -1:
        new_content = content[:start_idx] + new_section + content[section_end+10:]
        with open('index.html', 'w') as f:
            f.write(new_content)
        print("Successfully replaced Analysis section with Insights section")
    else:
        print("Could not find section end tag")
else:
    print(f"Start marker: {start_idx}, End marker: {end_idx}")