import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import InlineTopicCreate from "@/components/anon/InlineTopicCreate";
import { LOCAL_TOPICS_KEY, createLocalTopic } from "@/lib/local/localTopics";

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_TOPICS_KEY }));
});

afterEach(() => {
  cleanup();
});

describe("InlineTopicCreate", () => {
  it("reveals a name input after clicking 'New topic'", () => {
    render(<InlineTopicCreate onCreated={vi.fn()} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new topic/i }));

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("creates a topic and calls onCreated when confirmed with a valid name", async () => {
    const onCreated = vi.fn();
    render(<InlineTopicCreate onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /new topic/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Deep Work" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ name: "Deep Work" }));
    });
  });

  it("shows an inline error and does not call onCreated for a duplicate name", async () => {
    createLocalTopic("Reading");
    const onCreated = vi.fn();
    render(<InlineTopicCreate onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /new topic/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Reading" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });
});
