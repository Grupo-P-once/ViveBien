import json

file_path = 'workflow-vivebien-firebase.json'
with open(file_path, 'r', encoding='utf-8') as f:
    wf = json.load(f)

for node in wf['nodes']:
    if node['name'] == 'Generar Email HTML' and 'parameters' in node and 'jsCode' in node['parameters']:
        code = node['parameters']['jsCode']
        node['parameters']['jsCode'] = code.replace(
            "return [{ json: { email: json.email, nombre, asunto, emailHtml: html, firebasePayload } }];",
            "return { json: { email: json.email, nombre, asunto, emailHtml: html, firebasePayload } };"
        )

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=False, indent=2)

print('Fixed jsCode block using Python completely')
