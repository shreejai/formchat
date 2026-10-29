import { ChatForm } from "@/components/chat/chat-form";
import { nagpurhomes } from "@/forms/nagpurhomes";
import { nagpurLocalities } from "@/forms/nagpurhomes-localities";

export default function Home() {
  return <ChatForm schema={nagpurhomes} localities={nagpurLocalities} />;
}
