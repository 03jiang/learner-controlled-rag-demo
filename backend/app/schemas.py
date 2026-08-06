from typing import Literal

from pydantic import BaseModel, Field


SupportFunction = Literal[
    "focus_scaffold",
    "explicit_patterner",
    "creative_facilitator",
    "sensory_shield",
    "scope_guardian",
]


class SupportConfiguration(BaseModel):
    step_size: Literal["small", "medium", "large"] = "medium"
    structure_level: Literal["minimal", "progressive", "full"] = "progressive"
    pattern_guidance: Literal["off", "optional", "active"] = "optional"
    explanation_mode: Literal["concrete", "formal", "concrete_then_formal"] = (
        "concrete_then_formal"
    )
    presentation_density: Literal["low", "medium", "high"] = "medium"
    scope_support: Literal["off", "on_request", "active"] = "on_request"


class TaskState(BaseModel):
    objective: str = Field(min_length=1, max_length=500)
    requirements: list[str] = Field(default_factory=list, max_length=20)
    current_step: str | None = Field(default=None, max_length=500)
    completed_steps: list[str] = Field(default_factory=list, max_length=50)
    deferred_ideas: list[str] = Field(default_factory=list, max_length=50)


class ProposedStateUpdate(BaseModel):
    current_step: str | None = None
    requirements_to_add: list[str] = Field(default_factory=list)
    completed_steps_to_add: list[str] = Field(default_factory=list)
    deferred_ideas_to_add: list[str] = Field(default_factory=list)


class ProposedConfigurationUpdate(BaseModel):
    reason: str
    changes: dict[str, str] = Field(default_factory=dict)


class InstructionalResponse(BaseModel):
    explanation: str = Field(min_length=1)
    next_action: str = Field(min_length=1)
    optional_hint: str | None = None
    proposed_state_update: ProposedStateUpdate | None = None
    proposed_configuration_update: ProposedConfigurationUpdate | None = None


class RewriteRequest(BaseModel):
    text: str = Field(default="", max_length=10_000)
    document_id: str | None = Field(default=None, max_length=64)
    query: str | None = Field(default=None, max_length=500)
    support_configuration: SupportConfiguration = Field(
        default_factory=SupportConfiguration
    )
    task_state: TaskState


class RewriteResponse(BaseModel):
    original: str
    support: InstructionalResponse
    support_configuration: SupportConfiguration
    selected_functions: list[SupportFunction]
    retrieved_sources: list[dict[str, str | int | float]] = Field(default_factory=list)
