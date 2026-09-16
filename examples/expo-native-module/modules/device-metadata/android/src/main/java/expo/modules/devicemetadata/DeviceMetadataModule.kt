package expo.modules.devicemetadata

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceMetadataModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceMetadata")

    Events("onChange")

    Constant("PI") {
      Math.PI
    }

    Function("hello") {
      "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { value: String ->
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    View(DeviceMetadataView::class) {
    }
  }
}
