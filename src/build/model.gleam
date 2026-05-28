import build/actors/agent
import build/actors/chat
import build/actors/preview
import build/actors/project
import build/actors/settings
import build/actors/webcontainer

pub type Model {
  Model(
    settings: settings.State,
    chat: chat.State,
    project: project.State,
    agent: agent.State,
    preview: preview.State,
    webcontainer: webcontainer.State,
  )
}

pub fn init() -> Model {
  Model(
    settings: settings.init(),
    chat: chat.init(),
    project: project.init(),
    agent: agent.init(),
    preview: preview.init(),
    webcontainer: webcontainer.init(),
  )
}
