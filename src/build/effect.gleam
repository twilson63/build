import build/actors/agent
import build/actors/preview
import build/actors/project
import build/actors/settings
import build/actors/webcontainer
import build/pure/templates

pub type Effect {
  Settings(settings.Effect)
  Project(project.Effect)
  Agent(agent.Effect)
  Preview(preview.Effect)
  WebContainer(webcontainer.Effect)
  ExportZip(files: List(templates.ProjectFile))
}
