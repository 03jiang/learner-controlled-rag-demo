from app.schemas import SupportConfiguration, SupportFunction, TaskState


FUNCTION_INSTRUCTIONS: dict[SupportFunction, str] = {
    "focus_scaffold": (
        "Focus Scaffold：将学习推进拆成可管理行动，给出一个清晰的立即下一步，"
        "并按配置控制一次展示多少后续计划。"
    ),
    "explicit_patterner": (
        "Explicit Patterner：通过结构、比较或模式提示呈现概念关系，"
        "但不要立即替代学习者的推理。"
    ),
    "creative_facilitator": (
        "Creative Facilitator：使用例子、类比或具体过程解释抽象概念，"
        "同时保持当前学习目标。"
    ),
    "sensory_shield": (
        "Sensory Shield：减少初始信息量和不必要选项；额外内容放进 optional_hint。"
    ),
    "scope_guardian": (
        "Scope Guardian：只依据 task_state.requirements 和 objective 区分核心与可选内容；"
        "不得发明要求，不得擅自丢弃内容。"
    ),
}


def select_support_functions(
    configuration: SupportConfiguration,
    task_state: TaskState,
) -> list[SupportFunction]:
    """Select the smallest useful set for the current adaptation request."""
    selected: list[SupportFunction] = []

    if configuration.step_size == "small":
        selected.append("focus_scaffold")

    if configuration.structure_level != "minimal" or configuration.pattern_guidance == "active":
        selected.append("explicit_patterner")

    if configuration.explanation_mode != "formal":
        selected.append("creative_facilitator")

    if configuration.presentation_density == "low":
        selected.append("sensory_shield")

    # Scope decisions are disabled without learner-supplied, authorised requirements.
    if configuration.scope_support == "active" and task_state.requirements:
        selected.append("scope_guardian")

    if not selected:
        selected.append("explicit_patterner")

    return selected


def function_prompt(selected_functions: list[SupportFunction]) -> str:
    return "\n".join(f"- {FUNCTION_INSTRUCTIONS[name]}" for name in selected_functions)
