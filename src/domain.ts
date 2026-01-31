export type Board = {
  id: string;
  name: string;
  conferenceId: string;
};

export type Conference = {
  id: string;
  slug: string | null;
  name: string;
  isRoot: boolean;
  welcomeTitle: string;
  welcomeBody: string;
  menuTitle: string;
  menuBody: string;
  updatedAt: string;
  updatedBy: string;
};

export type ConferenceMenuActionType = "board" | "page" | "link" | "conference";

export type ConferenceMenuItem = {
  id: string;
  conferenceId: string;
  label: string;
  displayNo: string;
  displayType: string;
  actionType: ConferenceMenuActionType;
  actionRef: string;
  body: string;
  hidden: boolean;
  updatedAt: string;
  updatedBy: string;
};

export type PostSummary = {
  id: string;
  title: string;
  author: string;
  createdAt: string;
};

export type Post = {
  id: string;
  conferenceId: string;
  boardId: string;
  title: string;
  body: string;
  author: string;
  createdAt: string;
};
