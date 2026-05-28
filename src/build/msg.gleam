import build/actors/agent
import build/actors/chat
import build/actors/preview
import build/actors/project
import build/actors/settings
import build/actors/webcontainer

pub type Msg {
  InitApp
  SaveSettings
  SaveProject(silent: Bool)
  NewProject
  SubmitPrompt(request_id: String, now: Int)
  ImproveSelectedElement(request_id: String, now: Int)
  CancelAgent
  ResetProject
  ExportZip
  OpenProject(String)
  RemoveProject(String)
  Settings(settings.Msg)
  Chat(chat.Msg)
  Project(project.Msg)
  Agent(agent.Msg)
  Preview(preview.Msg)
  WebContainer(webcontainer.Msg)
}
