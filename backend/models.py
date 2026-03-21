from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class ScenarioRun(Base):
    __tablename__ = "scenario_runs"

    id = Column(String, primary_key=True)
    scenario_id = Column(String, nullable=False)
    agent_mode = Column(String, nullable=False)  # 'baseline' or 'guarded'
    model = Column(String, nullable=False, default="claude-haiku-4-5-20251001")
    status = Column(String, nullable=False, default="pending")  # pending, running, completed, failed
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    actions = relationship("AgentAction", back_populates="run", order_by="AgentAction.turn")
    score = relationship("RunScore", back_populates="run", uselist=False)


class AgentAction(Base):
    __tablename__ = "agent_actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("scenario_runs.id"), nullable=False)
    turn = Column(Integer, nullable=False)
    action_type = Column(String, nullable=False)  # 'message', 'tool_call', 'tool_result'
    tool_name = Column(String, nullable=True)
    tool_input = Column(Text, nullable=True)
    tool_output = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    is_unsafe = Column(Boolean, default=False)
    unsafe_types = Column(Text, nullable=True)  # JSON array
    timestamp = Column(DateTime, default=datetime.utcnow)

    run = relationship("ScenarioRun", back_populates="actions")


class RunScore(Base):
    __tablename__ = "run_scores"

    run_id = Column(String, ForeignKey("scenario_runs.id"), primary_key=True)
    task_success = Column(Float, default=0.0)
    unsafe_action_count = Column(Integer, default=0)
    total_actions = Column(Integer, default=0)
    unsafe_action_rate = Column(Float, default=0.0)
    escalation_count = Column(Integer, default=0)
    escalation_rate = Column(Float, default=0.0)
    shutdown_interference = Column(Boolean, default=False)
    deception_detected = Column(Boolean, default=False)
    alignment_score = Column(Float, default=100.0)
    judge_analysis = Column(Text, nullable=True)

    run = relationship("ScenarioRun", back_populates="score")


class EvalRecord(Base):
    __tablename__ = "eval_records"

    id = Column(String, primary_key=True)
    batch_id = Column(String, nullable=False, index=True)
    source_file = Column(String, nullable=True)
    prompt = Column(Text, nullable=False)
    model_output = Column(Text, nullable=False)
    model_name = Column(String, nullable=True)
    source = Column(String, nullable=True)
    tags_json = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)

    break_success = Column(Boolean, default=False)
    composite_break_score = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    rationale = Column(Text, nullable=True)
    evidence_json = Column(Text, nullable=True)

    policy_evasion = Column(Boolean, default=False)
    data_exfiltration = Column(Boolean, default=False)
    shutdown_interference = Column(Boolean, default=False)
    self_preservation = Column(Boolean, default=False)
    manipulation = Column(Boolean, default=False)
    deception = Column(Float, default=0.0)

    grader_prompt_version = Column(String, nullable=False, default="v1")
    raw_grader_response = Column(Text, nullable=True)
    error_json = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    graded_at = Column(DateTime, default=datetime.utcnow)


class EvalAnalysis(Base):
    __tablename__ = "eval_analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(String, nullable=False, index=True)
    trigger_mode = Column(String, nullable=False, default="manual")
    eval_count = Column(Integer, nullable=False, default=0)

    summary_metrics_json = Column(Text, nullable=False)
    failure_mode_counts_json = Column(Text, nullable=False)
    analyzer_findings_json = Column(Text, nullable=False)
    analyzer_findings_markdown = Column(Text, nullable=False)

    analyzer_prompt_version = Column(String, nullable=False, default="v1")
    raw_analyzer_response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
